"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_RETEMPO_API_BASE_URL ?? "http://localhost:8787";
const API_ROOT = "/api/v1";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue | undefined };
type JsonRecord = Record<string, JsonValue | undefined>;

type User = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
};

type PaymentPlan = {
  id: string;
  serviceId: string;
  name: string;
  description?: string | null;
  pricingType: string;
  billingInterval: string;
  amount: string;
  currency: string;
  createdAt: string;
};

type Service = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  createdAt: string;
  owner?: User;
  paymentPlans?: PaymentPlan[];
};

type CheckoutSession = {
  id: string;
  serviceId: string;
  paymentPlanId: string;
  userId?: string | null;
  status: string;
  expiresAt?: string | null;
  createdAt: string;
  service?: Service;
  paymentPlan?: PaymentPlan;
};

type Invoice = {
  id: string;
  serviceId: string;
  paymentPlanId: string;
  userId: string;
  subscriptionId?: string | null;
  status: string;
  amount: string;
  currency: string;
  dueAt?: string | null;
  createdAt: string;
  service?: Service;
  paymentPlan?: PaymentPlan;
  user?: User;
  settlements?: Settlement[];
};

type Settlement = {
  id: string;
  invoiceId: string;
  serviceId: string;
  payerId: string;
  merchantId: string;
  amount: string;
  currency: string;
  referenceHash: string;
  transactionHash?: string | null;
  status: string;
  recordedAt?: string | null;
  createdAt: string;
  invoice?: Invoice;
  service?: Service;
  payer?: User;
  merchant?: User;
};

type FormState = Record<string, string>;

const initialServiceForm: FormState = {
  name: "",
  description: "",
  ownerEmail: "",
  ownerName: "",
  status: "DRAFT"
};

const initialPlanForm: FormState = {
  name: "",
  description: "",
  pricingType: "FIXED_RECURRING",
  billingInterval: "MONTH",
  amount: "",
  currency: "USDC"
};

const initialCheckoutForm: FormState = {
  paymentPlanId: "",
  userId: "",
  expiresAt: ""
};

const initialInvoiceForm: FormState = {
  paymentPlanId: "",
  userId: "",
  amount: "",
  currency: "USDC",
  status: "OPEN",
  dueAt: ""
};

const initialSettlementForm: FormState = {
  invoiceId: "",
  referenceHash: "",
  status: "PENDING",
  transactionHash: ""
};

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${API_ROOT}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `API request failed with ${response.status}.`);
  }
  return payload;
}

function cleanBody(values: FormState, aliases: Record<string, string> = {}) {
  return Object.entries(values).reduce<JsonRecord>((body, [key, value]) => {
    if (value.trim() === "") return body;
    body[aliases[key] ?? key] = value.trim();
    return body;
  }, {});
}

function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  required = false,
  placeholder
}: {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (name: string, value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      {label}
      <input
        className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        name={name}
        onChange={(event) => onChange(name, event.target.value)}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  value,
  onChange,
  options
}: {
  label: string;
  name: string;
  value: string;
  onChange: (name: string, value: string) => void;
  options: string[];
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      {label}
      <select
        className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        name={name}
        onChange={(event) => onChange(name, event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function SubmitButton({ label, loading }: { label: string; loading: boolean }) {
  return (
    <button
      className="h-11 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      disabled={loading}
      type="submit"
    >
      {loading ? "Sending to API..." : label}
    </button>
  );
}

function StatusPill({ value }: { value: string }) {
  const tone =
    value === "ACTIVE" || value === "OPEN"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : value === "SUBMITTED"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : value === "PENDING" || value === "DRAFT"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {value}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
      <dd className="break-all text-sm text-slate-900">{value || "-"}</dd>
    </div>
  );
}

export function RetempoWorkspace() {
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [lookup, setLookup] = useState({ checkoutSessionId: "", invoiceId: "", settlementId: "" });
  const [serviceForm, setServiceForm] = useState(initialServiceForm);
  const [planForm, setPlanForm] = useState(initialPlanForm);
  const [checkoutForm, setCheckoutForm] = useState(initialCheckoutForm);
  const [invoiceForm, setInvoiceForm] = useState(initialInvoiceForm);
  const [settlementForm, setSettlementForm] = useState(initialSettlementForm);
  const [loading, setLoading] = useState("services");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedPlanOptions = useMemo(() => {
    const options = plans.map((plan) => plan.id);
    if (checkoutForm.paymentPlanId && !options.includes(checkoutForm.paymentPlanId)) {
      options.unshift(checkoutForm.paymentPlanId);
    }
    return options;
  }, [checkoutForm.paymentPlanId, plans]);

  const selectedServiceOwner = selectedService?.owner;

  async function run<T>(key: string, action: () => Promise<T>, success?: string) {
    setLoading(key);
    setError("");
    setNotice("");
    try {
      const result = await action();
      if (success) setNotice(success);
      return result;
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Unexpected API error.");
      return undefined;
    } finally {
      setLoading("");
    }
  }

  async function refreshServices() {
    const payload = await run("services", () => apiRequest<{ services: Service[] }>("/services"));
    if (payload) {
      setServices(payload.services);
      if (!selectedServiceId && payload.services[0]) setSelectedServiceId(payload.services[0].id);
    }
  }

  async function refreshSelectedService(serviceId = selectedServiceId) {
    if (!serviceId) {
      setSelectedService(null);
      setPlans([]);
      return;
    }
    const servicePayload = await run("service", () =>
      apiRequest<{ service: Service }>(`/services/${serviceId}`)
    );
    const plansPayload = await run("plans", () =>
      apiRequest<{ plans: PaymentPlan[] }>(`/services/${serviceId}/plans`)
    );
    if (servicePayload) setSelectedService(servicePayload.service);
    if (plansPayload) {
      setPlans(plansPayload.plans);
      const firstPlan = plansPayload.plans[0]?.id ?? "";
      setCheckoutForm((current) => ({ ...current, paymentPlanId: current.paymentPlanId || firstPlan }));
      setInvoiceForm((current) => ({ ...current, paymentPlanId: current.paymentPlanId || firstPlan }));
    }
  }

  useEffect(() => {
    void refreshServices();
  }, []);

  useEffect(() => {
    void refreshSelectedService();
  }, [selectedServiceId]);

  function updateForm(setter: (value: FormState) => void, current: FormState) {
    return (name: string, value: string) => setter({ ...current, [name]: value });
  }

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = cleanBody(serviceForm);
    const ownerName = serviceForm.ownerName.trim();
    body.owner = ownerName
      ? { email: serviceForm.ownerEmail.trim(), name: ownerName, role: "DEVELOPER" }
      : { email: serviceForm.ownerEmail.trim(), role: "DEVELOPER" };
    delete body.ownerEmail;
    delete body.ownerName;

    const payload = await run(
      "create-service",
      () =>
        apiRequest<{ service: Service }>("/services", {
          method: "POST",
          body: JSON.stringify(body)
        }),
      "Service created by the backend."
    );
    if (payload) {
      setServiceForm(initialServiceForm);
      await refreshServices();
      setSelectedServiceId(payload.service.id);
    }
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedServiceId) return setError("Select or create a service first.");
    const payload = await run(
      "create-plan",
      () =>
        apiRequest<{ plan: PaymentPlan }>(`/services/${selectedServiceId}/plans`, {
          method: "POST",
          body: JSON.stringify(cleanBody(planForm))
        }),
      "Payment plan created by the backend."
    );
    if (payload) {
      setPlanForm(initialPlanForm);
      setCheckoutForm((current) => ({ ...current, paymentPlanId: payload.plan.id }));
      setInvoiceForm((current) => ({ ...current, paymentPlanId: payload.plan.id, amount: payload.plan.amount }));
      await refreshSelectedService();
    }
  }

  async function createCheckoutSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedServiceId) return setError("Select or create a service first.");
    const payload = await run(
      "create-checkout",
      () =>
        apiRequest<{ checkoutSession: CheckoutSession }>("/checkout-sessions", {
          method: "POST",
          body: JSON.stringify({ ...cleanBody(checkoutForm), serviceId: selectedServiceId })
        }),
      "Checkout session created with backend status."
    );
    if (payload) {
      setCheckoutSession(payload.checkoutSession);
      setLookup((current) => ({ ...current, checkoutSessionId: payload.checkoutSession.id }));
    }
  }

  async function fetchCheckoutSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = await run("checkout-detail", () =>
      apiRequest<{ checkoutSession: CheckoutSession }>(`/checkout-sessions/${lookup.checkoutSessionId}`)
    );
    if (payload) setCheckoutSession(payload.checkoutSession);
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedServiceId) return setError("Select or create a service first.");
    const payload = await run(
      "create-invoice",
      () =>
        apiRequest<{ invoice: Invoice }>("/invoices", {
          method: "POST",
          body: JSON.stringify({ ...cleanBody(invoiceForm), serviceId: selectedServiceId })
        }),
      "Invoice created with backend status."
    );
    if (payload) {
      setInvoice(payload.invoice);
      setLookup((current) => ({ ...current, invoiceId: payload.invoice.id }));
      setSettlementForm((current) => ({ ...current, invoiceId: payload.invoice.id }));
    }
  }

  async function fetchInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = await run("invoice-detail", () =>
      apiRequest<{ invoice: Invoice }>(`/invoices/${lookup.invoiceId}`)
    );
    if (payload) {
      setInvoice(payload.invoice);
      setSettlementForm((current) => ({ ...current, invoiceId: payload.invoice.id }));
    }
  }

  async function createSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = await run(
      "create-settlement",
      () =>
        apiRequest<{ settlement: Settlement }>("/settlements", {
          method: "POST",
          body: JSON.stringify(cleanBody(settlementForm))
        }),
      "Settlement record created with backend status."
    );
    if (payload) {
      setSettlement(payload.settlement);
      setLookup((current) => ({ ...current, settlementId: payload.settlement.id }));
    }
  }

  async function fetchSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = await run("settlement-detail", () =>
      apiRequest<{ settlement: Settlement }>(`/settlements/${lookup.settlementId}`)
    );
    if (payload) setSettlement(payload.settlement);
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-16">
          <div className="flex flex-col justify-center">
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-slate-950 md:text-5xl">
              Retempo coordinates real recurring USDC settlement state for services and agents.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-650">
              Build developer services, attach payment plans, create checkout sessions, issue invoices,
              and track settlement records from the live backend API. Operational state stays in the
              database; settlement proof belongs on Arc.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                className="rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                href="#dashboard"
              >
                Open dashboard
              </a>
              <a
                className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-500"
                href="#settlements"
              >
                View settlement flow
              </a>
            </div>
          </div>
          <div className="grid content-start gap-4 rounded-lg border border-slate-200 bg-slate-50 p-5">
            <div>
              <p className="text-sm font-semibold text-slate-500">API base URL</p>
              <p className="mt-1 break-all font-mono text-sm text-slate-900">{API_BASE_URL}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <p className="text-2xl font-semibold">{services.length}</p>
                <p className="text-xs font-medium uppercase text-slate-500">Services</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <p className="text-2xl font-semibold">{plans.length}</p>
                <p className="text-xs font-medium uppercase text-slate-500">Selected plans</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <p className="text-2xl font-semibold">{settlement?.status ?? "-"}</p>
                <p className="text-xs font-medium uppercase text-slate-500">Last settlement</p>
              </div>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              Status labels on this screen are returned by the backend. The UI does not mark checkout,
              invoice, or settlement records as paid, confirmed, or completed by itself.
            </p>
          </div>
        </div>
      </section>

      <section id="dashboard" className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[360px_1fr] lg:px-8">
        <aside className="grid content-start gap-6">
          <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5" onSubmit={createService}>
            <div>
              <h2 className="text-lg font-semibold">Create service</h2>
              <p className="mt-1 text-sm text-slate-600">POST /api/v1/services</p>
            </div>
            <Field
              label="Service name"
              name="name"
              onChange={updateForm(setServiceForm, serviceForm)}
              required
              value={serviceForm.name}
            />
            <Field
              label="Description"
              name="description"
              onChange={updateForm(setServiceForm, serviceForm)}
              value={serviceForm.description}
            />
            <SelectField
              label="Status"
              name="status"
              onChange={updateForm(setServiceForm, serviceForm)}
              options={["DRAFT", "ACTIVE", "DISABLED"]}
              value={serviceForm.status}
            />
            <Field
              label="Owner email"
              name="ownerEmail"
              onChange={updateForm(setServiceForm, serviceForm)}
              required
              type="email"
              value={serviceForm.ownerEmail}
            />
            <Field
              label="Owner name"
              name="ownerName"
              onChange={updateForm(setServiceForm, serviceForm)}
              value={serviceForm.ownerName}
            />
            <SubmitButton label="Create service" loading={loading === "create-service"} />
          </form>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Services</h2>
                <p className="mt-1 text-sm text-slate-600">GET /api/v1/services</p>
              </div>
              <button
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-500"
                onClick={() => void refreshServices()}
                type="button"
              >
                Refresh
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {services.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                  No services returned by the backend yet.
                </p>
              ) : (
                services.map((service) => (
                  <button
                    className={`rounded-md border p-3 text-left transition ${
                      service.id === selectedServiceId
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-slate-200 bg-white hover:border-slate-400"
                    }`}
                    key={service.id}
                    onClick={() => setSelectedServiceId(service.id)}
                    type="button"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{service.name}</span>
                      <StatusPill value={service.status} />
                    </span>
                    <span className="mt-1 block break-all text-xs text-slate-500">{service.id}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        <div className="grid gap-6">
          {(notice || error) && (
            <div
              className={`rounded-lg border p-4 text-sm font-medium ${
                error
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {error || notice}
            </div>
          )}

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Service detail</h2>
                <p className="mt-1 text-sm text-slate-600">GET /api/v1/services/:serviceId</p>
              </div>
              {selectedService && <StatusPill value={selectedService.status} />}
            </div>
            {selectedService ? (
              <dl className="mt-5 grid gap-4 md:grid-cols-2">
                <DetailRow label="Service ID" value={selectedService.id} />
                <DetailRow label="Name" value={selectedService.name} />
                <DetailRow label="Description" value={selectedService.description} />
                <DetailRow label="Owner ID" value={selectedServiceOwner?.id} />
                <DetailRow label="Owner email" value={selectedServiceOwner?.email} />
                <DetailRow label="Created" value={new Date(selectedService.createdAt).toLocaleString()} />
              </dl>
            ) : (
              <p className="mt-4 text-sm text-slate-600">Select or create a service to load backend detail.</p>
            )}
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5" onSubmit={createPlan}>
              <div>
                <h2 className="text-lg font-semibold">Create payment plan</h2>
                <p className="mt-1 text-sm text-slate-600">POST /api/v1/services/:serviceId/plans</p>
              </div>
              <Field label="Name" name="name" onChange={updateForm(setPlanForm, planForm)} required value={planForm.name} />
              <Field
                label="Description"
                name="description"
                onChange={updateForm(setPlanForm, planForm)}
                value={planForm.description}
              />
              <SelectField
                label="Pricing type"
                name="pricingType"
                onChange={updateForm(setPlanForm, planForm)}
                options={["FIXED_RECURRING", "USAGE_BASED", "ONE_TIME"]}
                value={planForm.pricingType}
              />
              <SelectField
                label="Billing interval"
                name="billingInterval"
                onChange={updateForm(setPlanForm, planForm)}
                options={["MONTH", "WEEK", "DAY", "NONE"]}
                value={planForm.billingInterval}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Amount"
                  name="amount"
                  onChange={updateForm(setPlanForm, planForm)}
                  required
                  type="number"
                  value={planForm.amount}
                />
                <Field label="Currency" name="currency" onChange={updateForm(setPlanForm, planForm)} value={planForm.currency} />
              </div>
              <SubmitButton label="Create plan" loading={loading === "create-plan"} />
            </form>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Payment plans</h2>
              <p className="mt-1 text-sm text-slate-600">GET /api/v1/services/:serviceId/plans</p>
              <div className="mt-4 grid gap-3">
                {plans.length === 0 ? (
                  <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                    No plans returned for the selected service.
                  </p>
                ) : (
                  plans.map((plan) => (
                    <div className="rounded-md border border-slate-200 p-4" key={plan.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{plan.name}</h3>
                          <p className="mt-1 text-sm text-slate-600">{plan.description || "No description"}</p>
                        </div>
                        <p className="text-sm font-semibold">
                          {plan.amount} {plan.currency}
                        </p>
                      </div>
                      <p className="mt-3 break-all text-xs text-slate-500">{plan.id}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {plan.pricingType} / {plan.billingInterval}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5" onSubmit={createCheckoutSession}>
              <div>
                <h2 className="text-lg font-semibold">Create checkout session</h2>
                <p className="mt-1 text-sm text-slate-600">POST /api/v1/checkout-sessions</p>
              </div>
              <SelectField
                label="Payment plan ID"
                name="paymentPlanId"
                onChange={updateForm(setCheckoutForm, checkoutForm)}
                options={selectedPlanOptions.length ? selectedPlanOptions : [""]}
                value={checkoutForm.paymentPlanId}
              />
              <Field
                label="Existing user ID"
                name="userId"
                onChange={updateForm(setCheckoutForm, checkoutForm)}
                placeholder="Optional"
                value={checkoutForm.userId}
              />
              <Field
                label="Expires at"
                name="expiresAt"
                onChange={updateForm(setCheckoutForm, checkoutForm)}
                type="datetime-local"
                value={checkoutForm.expiresAt}
              />
              <SubmitButton label="Create checkout" loading={loading === "create-checkout"} />
            </form>

            <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5">
              <form className="grid gap-3" onSubmit={fetchCheckoutSession}>
                <div>
                  <h2 className="text-lg font-semibold">Checkout status</h2>
                  <p className="mt-1 text-sm text-slate-600">GET /api/v1/checkout-sessions/:checkoutSessionId</p>
                </div>
                <Field
                  label="Checkout session ID"
                  name="checkoutSessionId"
                  onChange={(name, value) => setLookup({ ...lookup, [name]: value })}
                  required
                  value={lookup.checkoutSessionId}
                />
                <SubmitButton label="Fetch checkout" loading={loading === "checkout-detail"} />
              </form>
              {checkoutSession && (
                <dl className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                  <DetailRow label="Checkout ID" value={checkoutSession.id} />
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-500">Status</dt>
                    <dd className="mt-1">
                      <StatusPill value={checkoutSession.status} />
                    </dd>
                  </div>
                  <DetailRow label="Service" value={checkoutSession.service?.name ?? checkoutSession.serviceId} />
                  <DetailRow label="Payment plan" value={checkoutSession.paymentPlan?.name ?? checkoutSession.paymentPlanId} />
                </dl>
              )}
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5" onSubmit={createInvoice}>
              <div>
                <h2 className="text-lg font-semibold">Create invoice</h2>
                <p className="mt-1 text-sm text-slate-600">POST /api/v1/invoices</p>
              </div>
              <SelectField
                label="Payment plan ID"
                name="paymentPlanId"
                onChange={updateForm(setInvoiceForm, invoiceForm)}
                options={selectedPlanOptions.length ? selectedPlanOptions : [""]}
                value={invoiceForm.paymentPlanId}
              />
              <Field
                label="Existing payer user ID"
                name="userId"
                onChange={updateForm(setInvoiceForm, invoiceForm)}
                required
                value={invoiceForm.userId}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Amount"
                  name="amount"
                  onChange={updateForm(setInvoiceForm, invoiceForm)}
                  required
                  type="number"
                  value={invoiceForm.amount}
                />
                <Field label="Currency" name="currency" onChange={updateForm(setInvoiceForm, invoiceForm)} value={invoiceForm.currency} />
              </div>
              <SelectField
                label="Status"
                name="status"
                onChange={updateForm(setInvoiceForm, invoiceForm)}
                options={["DRAFT", "OPEN", "VOID", "EXPIRED"]}
                value={invoiceForm.status}
              />
              <Field label="Due at" name="dueAt" onChange={updateForm(setInvoiceForm, invoiceForm)} type="datetime-local" value={invoiceForm.dueAt} />
              <SubmitButton label="Create invoice" loading={loading === "create-invoice"} />
            </form>

            <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5">
              <form className="grid gap-3" onSubmit={fetchInvoice}>
                <div>
                  <h2 className="text-lg font-semibold">Invoice detail</h2>
                  <p className="mt-1 text-sm text-slate-600">GET /api/v1/invoices/:invoiceId</p>
                </div>
                <Field
                  label="Invoice ID"
                  name="invoiceId"
                  onChange={(name, value) => setLookup({ ...lookup, [name]: value })}
                  required
                  value={lookup.invoiceId}
                />
                <SubmitButton label="Fetch invoice" loading={loading === "invoice-detail"} />
              </form>
              {invoice && (
                <dl className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                  <DetailRow label="Invoice ID" value={invoice.id} />
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-500">Status</dt>
                    <dd className="mt-1">
                      <StatusPill value={invoice.status} />
                    </dd>
                  </div>
                  <DetailRow label="Amount" value={`${invoice.amount} ${invoice.currency}`} />
                  <DetailRow label="Payer user ID" value={invoice.userId} />
                </dl>
              )}
            </div>
          </section>

          <section id="settlements" className="grid gap-6 xl:grid-cols-2">
            <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5" onSubmit={createSettlement}>
              <div>
                <h2 className="text-lg font-semibold">Create settlement</h2>
                <p className="mt-1 text-sm text-slate-600">POST /api/v1/settlements</p>
              </div>
              <Field
                label="Invoice ID"
                name="invoiceId"
                onChange={updateForm(setSettlementForm, settlementForm)}
                required
                value={settlementForm.invoiceId}
              />
              <Field
                label="Reference hash"
                name="referenceHash"
                onChange={updateForm(setSettlementForm, settlementForm)}
                required
                value={settlementForm.referenceHash}
              />
              <SelectField
                label="Backend settlement status"
                name="status"
                onChange={updateForm(setSettlementForm, settlementForm)}
                options={["PENDING", "SUBMITTED"]}
                value={settlementForm.status}
              />
              <Field
                label="Transaction hash"
                name="transactionHash"
                onChange={updateForm(setSettlementForm, settlementForm)}
                placeholder="Optional real transaction reference"
                value={settlementForm.transactionHash}
              />
              <SubmitButton label="Create settlement" loading={loading === "create-settlement"} />
            </form>

            <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5">
              <form className="grid gap-3" onSubmit={fetchSettlement}>
                <div>
                  <h2 className="text-lg font-semibold">Settlement detail</h2>
                  <p className="mt-1 text-sm text-slate-600">GET /api/v1/settlements/:settlementId</p>
                </div>
                <Field
                  label="Settlement ID"
                  name="settlementId"
                  onChange={(name, value) => setLookup({ ...lookup, [name]: value })}
                  required
                  value={lookup.settlementId}
                />
                <SubmitButton label="Fetch settlement" loading={loading === "settlement-detail"} />
              </form>
              {settlement && (
                <dl className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                  <DetailRow label="Settlement ID" value={settlement.id} />
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-500">Status from database</dt>
                    <dd className="mt-1">
                      <StatusPill value={settlement.status} />
                    </dd>
                  </div>
                  <DetailRow label="Reference hash" value={settlement.referenceHash} />
                  <DetailRow label="Transaction hash" value={settlement.transactionHash} />
                  <DetailRow label="Amount" value={`${settlement.amount} ${settlement.currency}`} />
                  <DetailRow label="Invoice ID" value={settlement.invoiceId} />
                </dl>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
