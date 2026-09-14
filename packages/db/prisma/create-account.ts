import { PrismaClient, type UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.USER_EMAIL || "supply@dineiz.com";
  const password = process.env.USER_PASSWORD || "supply@123";
  const role: UserRole = "OWNER";
  const name = process.env.USER_NAME || "Dineiz Admin";
  const pin = process.env.USER_PIN || "9999";
  // Deliberately no fallback: this script has been run twice against the
  // same production database for two different, unrelated businesses.
  // `warehouse.findFirst()` with no filter silently reused whichever
  // warehouse already existed -- the second run attached a brand-new
  // login to someone else's real customers, items and transactions.
  // Requiring an explicit, distinct name for every run makes that
  // mistake structurally impossible instead of merely unlikely.
  const warehouseName = process.env.WAREHOUSE_NAME;
  if (!warehouseName) {
    console.error(
      "WAREHOUSE_NAME is required. Set it to a name unique to this business " +
        "(e.g. \"Acme Traders\") -- never leave it unset, even for the very first " +
        "warehouse. Existing warehouse names are safe to reuse on purpose (e.g. " +
        "to add a second user to the same business); a new name always creates " +
        "a brand-new, independent warehouse."
    );
    process.exit(1);
  }

  console.log(`Connecting to database and setting up account for ${email} in warehouse "${warehouseName}"...`);

  let warehouse = await prisma.warehouse.findFirst({ where: { name: warehouseName } });
  if (!warehouse) {
    console.log(`No warehouse named "${warehouseName}" found. Creating it...`);
    warehouse = await prisma.warehouse.create({
      data: {
        name: warehouseName,
        address: "Main Branch",
        currency: "PKR",
        timezone: "Asia/Karachi",
      },
    });

    // A brand-new warehouse otherwise opens Setup > Units to a completely
    // empty list -- these are the handful of universal units almost every
    // warehouse needs on day one. Nothing stops the owner from adding more
    // (a "Bag (20kg)"-style unit, say) once they know what they buy in.
    console.log("Seeding default units (Kilogram, Gram, Litre, Millilitre, Piece, Dozen)...");
    await prisma.unit.createMany({
      data: [
        { warehouseId: warehouse.id, code: "KG", name: "Kilogram", type: "WEIGHT" },
        { warehouseId: warehouse.id, code: "G", name: "Gram", type: "WEIGHT" },
        { warehouseId: warehouse.id, code: "L", name: "Litre", type: "VOLUME" },
        { warehouseId: warehouse.id, code: "ML", name: "Millilitre", type: "VOLUME" },
        { warehouseId: warehouse.id, code: "PCS", name: "Piece", type: "COUNT" },
        { warehouseId: warehouse.id, code: "DZN", name: "Dozen", type: "COUNT" },
      ],
    });

    // Same reasoning as the units above: Receiving and the item page's
    // "+ Add stock" both require picking a supplier, and a brand-new
    // warehouse has none -- a plain, generic placeholder means the owner
    // can record their first stock immediately, then rename it (or add
    // real ones) whenever they get around to Setup > Suppliers.
    console.log("Seeding a default placeholder supplier (General Supplier)...");
    await prisma.supplier.create({
      data: { warehouseId: warehouse.id, name: "General Supplier" },
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const pinHash = await bcrypt.hash(pin, 10);

  const existingUser = await prisma.user.findFirst({
    where: { warehouseId: warehouse.id, email },
  });

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash,
        pinHash,
        role,
        name,
        isActive: true,
      },
    });
    console.log(`Successfully updated existing user: ${email} (Role: ${role})`);
  } else {
    await prisma.user.create({
      data: {
        warehouseId: warehouse.id,
        name,
        email,
        passwordHash,
        pinHash,
        role,
        isActive: true,
      },
    });
    console.log(`Successfully created new user: ${email} (Role: ${role})`);
  }

  console.log(`Warehouse: ${warehouse.name} (${warehouse.id})`);
  console.log(`Credentials:`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  PIN:      ${pin}`);
}

main()
  .catch((e) => {
    console.error("Error creating account:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
