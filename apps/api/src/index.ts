import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { db, Prisma } from "@retempo/db";
import { API_ROOT, APP_NAME } from "@retempo/shared";

export const app = new Hono();

app.use(
  `${API_ROOT}/*`,
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    allowHeaders: ["Content-Type"],
    allowMethods: ["GET", "POST", "OPTIONS"]
  })
);

type JsonRecord = Record<string, unknown>;
type ApiStatus = Extract<ContentfulStatusCode, 400 | 404 | 409 | 500>;

const serviceInclude = { owner: true, paymentPlans: true } as const;
const invoiceInclude = {
  paymentPlan: true,
  service: true,
  settlements: true,
  subscription: true,
  usageEvents: true,
  user: true
} as const;
const settlementInclude = {
  invoice: true,
  merchant: true,
  payer: true,
  service: true
} as const;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readBody(c: Context) {
  const body = await c.req.json().catch(() => null);
  if (!isRecord(body)) {
    throw new ApiError(400, "Request body must be a JSON object.");
  }
  return body;
}

function stringField(body: JsonRecord, key: string, options: { required?: boolean } = {}) {
  const value = body[key];
  if (value === undefined || value === null) {
    if (options.required) {
      throw new ApiError(400, `${key} is required.`);
    }
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `${key} must be a non-empty string.`);
  }
  return value.trim();
}

function requiredStringField(body: JsonRecord, key: string) {
  return stringField(body, key, { required: true })!;
}

function enumField<T extends string>(
  body: JsonRecord,
  key: string,
  allowed: readonly T[],
  fallback?: T
) {
  const value = body[key];
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ApiError(400, `${key} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

function decimalField(body: JsonRecord, key: string, options: { required?: boolean } = {}) {
  const value = body[key];
  if (value === undefined || value === null) {
    if (options.required) {
      throw new ApiError(400, `${key} is required.`);
    }
    return undefined;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ApiError(400, `${key} must be a decimal string or number.`);
  }
  const decimal = new Prisma.Decimal(value);
  if (!decimal.isFinite() || decimal.isNegative()) {
    throw new ApiError(400, `${key} must be a non-negative decimal.`);
  }
  return decimal;
}

function dateField(body: JsonRecord, key: string) {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, `${key} must be an ISO date string.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `${key} must be a valid ISO date string.`);
  }
  return date;
}

function nestedRecord(body: JsonRecord, key: string) {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new ApiError(400, `${key} must be a JSON object.`);
  }
  return value;
}

class ApiError extends Error {
  constructor(
    public readonly status: ApiStatus,
    message: string
  ) {
    super(message);
  }
}

function jsonError(c: Context, status: ApiStatus, message: string) {
  return c.json({ error: message }, status);
}

async function ensurePlanBelongsToService(paymentPlanId: string, serviceId: string) {
  const plan = await db.paymentPlan.findUnique({ where: { id: paymentPlanId } });
  if (!plan || plan.serviceId !== serviceId) {
    throw new ApiError(404, "Payment plan was not found for the service.");
  }
  return plan;
}

async function ensureSubscriptionContext(subscriptionId: string, serviceId: string, userId: string) {
  const subscription = await db.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription || subscription.serviceId !== serviceId || subscription.userId !== userId) {
    throw new ApiError(404, "Subscription was not found for the service and user.");
  }
  return subscription;
}

async function upsertUserFromBody(
  body: JsonRecord,
  idKey: "ownerId" | "userId",
  nestedKey: "owner" | "user",
  fallbackRole: "DEVELOPER" | "PAYER"
) {
  const id = stringField(body, idKey);
  if (id) {
    return db.user.findUniqueOrThrow({ where: { id } });
  }

  const userBody = nestedRecord(body, nestedKey);
  if (!userBody) {
    throw new ApiError(400, `${idKey} or ${nestedKey}.email is required.`);
  }

  const email = requiredStringField(userBody, "email");
  const role = enumField(userBody, "role", ["DEVELOPER", "PAYER"] as const, fallbackRole);

  return db.user.upsert({
    create: {
      email,
      name: stringField(userBody, "name"),
      role
    },
    update: {
      name: stringField(userBody, "name")
    },
    where: { email }
  });
}

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return jsonError(c, error.status, error.message);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return jsonError(c, 404, "Referenced database record was not found.");
    }
    if (error.code === "P2002") {
      return jsonError(c, 409, "A database record with these unique fields already exists.");
    }
    if (error.code === "P2003") {
      return jsonError(c, 400, "A referenced database record does not exist.");
    }
  }

  console.error(error);
  return jsonError(c, 500, "Internal server error.");
});

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: APP_NAME,
    apiRoot: API_ROOT
  });
});

app.post(`${API_ROOT}/services`, async (c) => {
  const body = await readBody(c);
  const owner = await upsertUserFromBody(body, "ownerId", "owner", "DEVELOPER");

  const service = await db.service.create({
    data: {
      description: stringField(body, "description"),
      name: requiredStringField(body, "name"),
      ownerId: owner.id,
      status: enumField(body, "status", ["DRAFT", "ACTIVE", "DISABLED"] as const, "DRAFT")
    },
    include: serviceInclude
  });

  return c.json({ service }, 201);
});

app.get(`${API_ROOT}/services`, async (c) => {
  const services = await db.service.findMany({
    include: serviceInclude,
    orderBy: { createdAt: "desc" }
  });

  return c.json({ services });
});

app.get(`${API_ROOT}/services/:serviceId`, async (c) => {
  const service = await db.service.findUnique({
    include: serviceInclude,
    where: { id: c.req.param("serviceId") }
  });

  if (!service) {
    return jsonError(c, 404, "Service was not found.");
  }

  return c.json({ service });
});

app.post(`${API_ROOT}/services/:serviceId/plans`, async (c) => {
  const serviceId = c.req.param("serviceId");
  const body = await readBody(c);
  await db.service.findUniqueOrThrow({ where: { id: serviceId } });

  const plan = await db.paymentPlan.create({
    data: {
      amount: decimalField(body, "amount", { required: true })!,
      billingInterval: enumField(
        body,
        "billingInterval",
        ["MONTH", "WEEK", "DAY", "NONE"] as const,
        "NONE"
      )!,
      currency: stringField(body, "currency") ?? "USDC",
      description: stringField(body, "description"),
      name: requiredStringField(body, "name"),
      pricingType: enumField(
        body,
        "pricingType",
        ["FIXED_RECURRING", "USAGE_BASED", "ONE_TIME"] as const
      )!,
      serviceId
    }
  });

  return c.json({ plan }, 201);
});

app.get(`${API_ROOT}/services/:serviceId/plans`, async (c) => {
  const serviceId = c.req.param("serviceId");
  await db.service.findUniqueOrThrow({ where: { id: serviceId } });

  const plans = await db.paymentPlan.findMany({
    orderBy: { createdAt: "desc" },
    where: { serviceId }
  });

  return c.json({ plans });
});

app.post(`${API_ROOT}/checkout-sessions`, async (c) => {
  const body = await readBody(c);
  const serviceId = requiredStringField(body, "serviceId");
  const paymentPlanId = requiredStringField(body, "paymentPlanId");
  await ensurePlanBelongsToService(paymentPlanId, serviceId);

  const userId = stringField(body, "userId");
  if (userId) {
    await db.user.findUniqueOrThrow({ where: { id: userId } });
  }

  const rejectedStatus = enumField(body, "status", ["PENDING", "PAID", "EXPIRED", "CANCELLED"] as const);
  if (rejectedStatus && rejectedStatus !== "PENDING") {
    throw new ApiError(400, "Checkout sessions can only be created with PENDING status.");
  }

  const checkoutSession = await db.checkoutSession.create({
    data: {
      expiresAt: dateField(body, "expiresAt"),
      paymentPlanId,
      serviceId,
      status: "PENDING",
      userId
    },
    include: { paymentPlan: true, service: true, user: true }
  });

  return c.json({ checkoutSession }, 201);
});

app.get(`${API_ROOT}/checkout-sessions/:checkoutSessionId`, async (c) => {
  const checkoutSession = await db.checkoutSession.findUnique({
    include: { paymentPlan: true, service: true, subscriptions: true, user: true },
    where: { id: c.req.param("checkoutSessionId") }
  });

  if (!checkoutSession) {
    return jsonError(c, 404, "Checkout session was not found.");
  }

  return c.json({ checkoutSession });
});

app.post(`${API_ROOT}/usage-events`, async (c) => {
  const body = await readBody(c);
  const serviceId = requiredStringField(body, "serviceId");
  const subscriptionId = requiredStringField(body, "subscriptionId");
  const userId = requiredStringField(body, "userId");
  await ensureSubscriptionContext(subscriptionId, serviceId, userId);

  const invoiceId = stringField(body, "invoiceId");
  if (invoiceId) {
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (invoice.serviceId !== serviceId || invoice.userId !== userId) {
      throw new ApiError(400, "Invoice does not match the usage event service and user.");
    }
  }

  const usageEvent = await db.usageEvent.create({
    data: {
      eventKey: requiredStringField(body, "eventKey"),
      invoiceId,
      occurredAt: dateField(body, "occurredAt") ?? new Date(),
      quantity: decimalField(body, "quantity", { required: true })!,
      serviceId,
      subscriptionId,
      userId
    },
    include: { invoice: true, service: true, subscription: true, user: true }
  });

  return c.json({ usageEvent }, 201);
});

app.post(`${API_ROOT}/invoices`, async (c) => {
  const body = await readBody(c);
  const serviceId = requiredStringField(body, "serviceId");
  const paymentPlanId = requiredStringField(body, "paymentPlanId");
  const userId = requiredStringField(body, "userId");
  await ensurePlanBelongsToService(paymentPlanId, serviceId);
  await db.user.findUniqueOrThrow({ where: { id: userId } });

  const status = enumField(body, "status", ["DRAFT", "OPEN", "PAID", "VOID", "EXPIRED"] as const, "DRAFT");
  if (status === "PAID") {
    throw new ApiError(400, "Invoices cannot be created as PAID without a real payment event.");
  }

  const subscriptionId = stringField(body, "subscriptionId");
  if (subscriptionId) {
    await ensureSubscriptionContext(subscriptionId, serviceId, userId);
  }

  const invoice = await db.invoice.create({
    data: {
      amount: decimalField(body, "amount", { required: true })!,
      currency: stringField(body, "currency") ?? "USDC",
      dueAt: dateField(body, "dueAt"),
      paymentPlanId,
      serviceId,
      status,
      subscriptionId,
      userId
    },
    include: invoiceInclude
  });

  return c.json({ invoice }, 201);
});

app.get(`${API_ROOT}/invoices/:invoiceId`, async (c) => {
  const invoice = await db.invoice.findUnique({
    include: invoiceInclude,
    where: { id: c.req.param("invoiceId") }
  });

  if (!invoice) {
    return jsonError(c, 404, "Invoice was not found.");
  }

  return c.json({ invoice });
});

app.post(`${API_ROOT}/settlements`, async (c) => {
  const body = await readBody(c);
  const invoiceId = requiredStringField(body, "invoiceId");
  const invoice = await db.invoice.findUniqueOrThrow({
    include: { service: true },
    where: { id: invoiceId }
  });

  const status = enumField(body, "status", ["PENDING", "SUBMITTED"] as const, "PENDING");
  const payerId = stringField(body, "payerId") ?? invoice.userId;
  const merchantId = stringField(body, "merchantId") ?? invoice.service.ownerId;

  if (payerId !== invoice.userId) {
    throw new ApiError(400, "Settlement payer must match the invoice user.");
  }
  if (merchantId !== invoice.service.ownerId) {
    throw new ApiError(400, "Settlement merchant must match the service owner.");
  }

  await db.user.findUniqueOrThrow({ where: { id: payerId } });
  await db.user.findUniqueOrThrow({ where: { id: merchantId } });

  const settlement = await db.settlement.create({
    data: {
      amount: decimalField(body, "amount") ?? invoice.amount,
      currency: stringField(body, "currency") ?? invoice.currency,
      invoiceId,
      merchantId,
      payerId,
      recordedAt: dateField(body, "recordedAt"),
      referenceHash: requiredStringField(body, "referenceHash"),
      serviceId: invoice.serviceId,
      status,
      transactionHash: stringField(body, "transactionHash")
    },
    include: settlementInclude
  });

  return c.json({ settlement }, 201);
});

app.get(`${API_ROOT}/settlements/:settlementId`, async (c) => {
  const settlement = await db.settlement.findUnique({
    include: settlementInclude,
    where: { id: c.req.param("settlementId") }
  });

  if (!settlement) {
    return jsonError(c, 404, "Settlement was not found.");
  }

  return c.json({ settlement });
});

const port = Number(process.env.PORT ?? 8787);

serve({
  fetch: app.fetch,
  port
});
