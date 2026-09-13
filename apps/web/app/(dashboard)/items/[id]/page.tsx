import { ItemForm } from "@/components/items/item-form";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ItemForm mode="edit" itemId={id} />;
}
