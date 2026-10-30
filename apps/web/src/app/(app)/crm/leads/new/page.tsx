"use client";

import { useRouter } from "next/navigation";
import { PageHeader, Section } from "@/components/common/page-header";
import { LeadForm } from "@/components/crm/lead-form";

export default function NewLeadPage() {
  const router = useRouter();
  return (
    <>
      <PageHeader title="New lead" back={{ href: "/crm/leads", label: "Leads" }} />
      <Section>
        <LeadForm onSaved={(id) => router.replace(`/crm/leads/${id}`)} onCancel={() => router.back()} />
      </Section>
    </>
  );
}
