// Customers order by WhatsApp. Messages arrive here as free text, e.g.
// "hi! two oat lattes and a croissant for pickup at 8:15, name's Dana"
export type Order = {
  customer: string | null;
  items: string[];
  pickupTime: string | null; // "HH:MM"
};

export async function parseOrder(message: string): Promise<Order> {
  throw new Error("not implemented");
}
