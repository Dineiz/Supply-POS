import { CustomerForm } from "@/components/customers/customer-form";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerForm mode="edit" customerId={id} />;
}
