"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, PhoneCall, Store, UserPlus } from "lucide-react";
import SearchSelect from "@/components/erp/SearchSelect";
import { FormActions, FormPageHeader, FormSection } from "@/components/erp/FormPage";
import { createLeadAction } from "@/app/(dashboard)/leads/actions";
import { LEAD_HEARD_FROM, LEAD_PROJECT_TYPES, LEAD_SOURCES, LEAD_TIMELINES } from "@/lib/leads/options";

interface LeadFormProps {
  categories: string[];
  users: { id: string; name: string }[];
  currentUserId: string;
  defaultEnquiryAt: string; // YYYY-MM-DDTHH:mm, India time
  today: string; // YYYY-MM-DD
}

const SOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  WALK_IN: Store,
  PHONE_CALL: PhoneCall,
};

export default function LeadForm({ categories, users, currentUserId, defaultEnquiryAt, today }: LeadFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState("");

  const [source, setSource] = useState("WALK_IN");
  const [enquiryAt, setEnquiryAt] = useState(defaultEnquiryAt);
  const [assignedToId, setAssignedToId] = useState(users.some((u) => u.id === currentUserId) ? currentUserId : "");
  const [heardFrom, setHeardFrom] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");

  const [interests, setInterests] = useState<string[]>([]);
  const [requirement, setRequirement] = useState("");
  const [areaSqft, setAreaSqft] = useState("");
  const [budget, setBudget] = useState("");
  const [projectType, setProjectType] = useState("");
  const [timeline, setTimeline] = useState("");

  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [notes, setNotes] = useState("");

  const backToList = () => router.push("/leads");

  const toggleInterest = (category: string) =>
    setInterests((prev) => (prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    // The browser knows the user's time zone, so it turns the picked local time into an exact instant.
    const enquiryInstant = enquiryAt ? new Date(enquiryAt) : new Date();
    startTransition(async () => {
      const res = await createLeadAction({
        source,
        enquiryAt: Number.isNaN(enquiryInstant.getTime()) ? undefined : enquiryInstant.toISOString(),
        name,
        phone,
        alternatePhone,
        email,
        city,
        address,
        interests,
        requirement,
        areaSqft: areaSqft ? Number(areaSqft) : null,
        budget: budget ? Number(budget) : null,
        projectType,
        timeline,
        heardFrom,
        assignedToId,
        nextFollowUpDate,
        notes,
      });
      if ("error" in res && res.error) {
        setErrorMsg(res.error);
        return;
      }
      const leadNo = "data" in res && res.data ? res.data.leadNo : "";
      router.push(`/leads?saved=${encodeURIComponent(leadNo)}`);
    });
  };

  return (
    <div className="w-full space-y-5">
      <FormPageHeader
        title="New Enquiry"
        subtitle="Record a walk-in or phone-call enquiry so the sales team can follow it up."
        icon={<UserPlus className="h-6 w-6 text-blue-600" />}
        onBack={backToList}
      />

      <form onSubmit={handleSubmit} id="lead-form" className="space-y-5">
        <FormSection number={1} title="Enquiry">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">Enquiry Type *</label>
              <div role="radiogroup" aria-label="Enquiry type" className="grid grid-cols-2 gap-2">
                {LEAD_SOURCES.map((s) => {
                  const Icon = SOURCE_ICONS[s.value];
                  const active = source === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSource(s.value)}
                      className={`h-10 inline-flex items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition ${
                        active
                          ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="lead-enquiry-at" className="font-semibold text-slate-700">Date &amp; Time *</label>
              <input
                id="lead-enquiry-at"
                type="datetime-local"
                required
                value={enquiryAt}
                onChange={(e) => setEnquiryAt(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">Salesperson</label>
              <SearchSelect
                value={assignedToId}
                onChange={(v) => setAssignedToId(v)}
                placeholder="Type to search staff"
                options={users.map((u) => ({ value: u.id, label: u.name }))}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">How They Heard About Us</label>
              <SearchSelect
                value={heardFrom}
                onChange={(v) => setHeardFrom(v)}
                placeholder="Type to search"
                options={LEAD_HEARD_FROM}
                className="w-full"
              />
            </div>
          </div>
        </FormSection>

        <FormSection number={2} title="Customer">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="lead-name" className="font-semibold text-slate-700">Customer Name *</label>
              <input
                id="lead-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ravi Kumar"
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="lead-phone" className="font-semibold text-slate-700">Phone Number *</label>
              <input
                id="lead-phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9876543210"
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="lead-alt-phone" className="font-semibold text-slate-700">Alternate Phone</label>
              <input
                id="lead-alt-phone"
                type="tel"
                value={alternatePhone}
                onChange={(e) => setAlternatePhone(e.target.value)}
                placeholder="Optional"
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="lead-email" className="font-semibold text-slate-700">Email Address</label>
              <input
                id="lead-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@customer.com"
                className="w-full"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1 lg:col-span-2">
              <label htmlFor="lead-city" className="font-semibold text-slate-700">Area / City</label>
              <input
                id="lead-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Katpadi, Vellore"
                className="w-full"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lead-address" className="font-semibold text-slate-700">Address / Site Location</label>
            <textarea
              id="lead-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, area, landmark"
              rows={2}
              className="w-full"
            />
          </div>
        </FormSection>

        <FormSection number={3} title="Requirement" description="What they are looking for, so the follow-up call can pick up where this left off.">
          <div className="space-y-1.5">
            <span className="block text-[13px] font-medium text-slate-700">Interested In</span>
            {categories.length === 0 ? (
              <p className="text-slate-500">No product categories yet. Describe the requirement below.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => {
                  const active = interests.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleInterest(c)}
                      className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-full border text-xs font-semibold transition ${
                        active
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {active && <Check className="h-3.5 w-3.5" />}
                      {c}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="lead-requirement" className="font-semibold text-slate-700">Requirement Details</label>
            <textarea
              id="lead-requirement"
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              placeholder="e.g. 2x2 vitrified floor tiles for living room, matt finish, light grey"
              rows={3}
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="lead-area" className="font-semibold text-slate-700">Approx. Area (sq.ft)</label>
              <input
                id="lead-area"
                type="number"
                min="0"
                step="0.01"
                value={areaSqft}
                onChange={(e) => setAreaSqft(e.target.value)}
                placeholder="e.g. 1200"
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="lead-budget" className="font-semibold text-slate-700">Approx. Budget (₹)</label>
              <input
                id="lead-budget"
                type="number"
                min="0"
                step="1"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="e.g. 150000"
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">Project Type</label>
              <SearchSelect
                value={projectType}
                onChange={(v) => setProjectType(v)}
                placeholder="Type to search"
                options={LEAD_PROJECT_TYPES}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">Planning to Buy</label>
              <SearchSelect
                value={timeline}
                onChange={(v) => setTimeline(v)}
                placeholder="Type to search"
                options={LEAD_TIMELINES}
                className="w-full"
              />
            </div>
          </div>
        </FormSection>

        <FormSection number={4} title="Follow-up" description="Set a follow-up date to put this lead on the 'due' list for that day.">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="lead-follow-up" className="font-semibold text-slate-700">Next Follow-up Date</label>
              <input
                id="lead-follow-up"
                type="date"
                min={today}
                value={nextFollowUpDate}
                onChange={(e) => setNextFollowUpDate(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lead-notes" className="font-semibold text-slate-700">Notes</label>
            <textarea
              id="lead-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else from the conversation: samples shown, quotes given, best time to call..."
              rows={3}
              className="w-full"
            />
          </div>

          {errorMsg && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-center space-x-1.5">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </FormSection>

        <FormActions submitLabel="Save Enquiry" pending={isPending} onCancel={backToList} />
      </form>
    </div>
  );
}
