import { PrismaClient, type UserRole as UserRoleType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateMovingAverage } from "@dineiz-supply/logic";

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function createItemWithOpeningStock(params: {
  warehouseId: string;
  name: string;
  nameUrdu?: string;
  categoryId: string;
  purchaseUnitId: string;
  sellUnitId: string;
  purchaseToSellFactor: number;
  baseSellPrice: number;
  openingQty: number;
  openingCost: number;
  isPerishable?: boolean;
  shelfLifeDays?: number;
  returnWindowHours?: number;
  minStockQty?: number;
  performedByName: string;
}) {
  const item = await prisma.item.create({
    data: {
      warehouseId: params.warehouseId,
      name: params.name,
      nameUrdu: params.nameUrdu,
      categoryId: params.categoryId,
      purchaseUnitId: params.purchaseUnitId,
      sellUnitId: params.sellUnitId,
      purchaseToSellFactor: params.purchaseToSellFactor,
      baseSellPrice: params.baseSellPrice,
      currentStockQty: params.openingQty,
      avgCostPerUnit: params.openingCost,
      isPerishable: params.isPerishable ?? false,
      shelfLifeDays: params.shelfLifeDays,
      returnWindowHours: params.returnWindowHours,
      minStockQty: params.minStockQty,
    },
  });

  await prisma.stockMovement.create({
    data: {
      warehouseId: params.warehouseId,
      itemId: item.id,
      type: "OPENING",
      qty: params.openingQty,
      qtyBefore: 0,
      qtyAfter: params.openingQty,
      unitCost: params.openingCost,
      totalCost: params.openingQty * params.openingCost,
      avgCostBefore: 0,
      avgCostAfter: params.openingCost,
      performedByName: params.performedByName,
      reason: "Opening stock",
    },
  });

  return item;
}

async function createCustomerWithOpeningBalance(params: {
  warehouseId: string;
  name: string;
  code: string;
  type?: "OWN_BRANCH" | "EXTERNAL_RESTAURANT" | "WALK_IN";
  phone?: string;
  creditLimit: number;
  creditDays?: number;
  openingBalance: number;
  balanceAgeDays: number;
}) {
  const customer = await prisma.customer.create({
    data: {
      warehouseId: params.warehouseId,
      name: params.name,
      code: params.code,
      type: params.type ?? "EXTERNAL_RESTAURANT",
      phone: params.phone,
      creditLimit: params.creditLimit,
      creditDays: params.creditDays ?? 30,
      currentBalance: params.openingBalance,
    },
  });

  if (params.openingBalance !== 0) {
    await prisma.customerLedger.create({
      data: {
        warehouseId: params.warehouseId,
        customerId: customer.id,
        entryType: "OPENING_BALANCE",
        debit: params.openingBalance,
        credit: 0,
        balanceAfter: params.openingBalance,
        entryDate: daysAgo(params.balanceAgeDays),
        description: "Opening balance",
      },
    });
  }

  return customer;
}

async function main() {
  console.log("Seeding Dineiz Supply...");

  const warehouse = await prisma.warehouse.create({
    data: {
      name: "Al-Noor Trading Co.",
      address: "Plot 42, Site Area, Karachi",
      phone: "0300-1234567",
      ntn: "1234567-8",
    },
  });

  // --- Users ---
  const ownerPasswordHash = await bcrypt.hash("owner123", 10);
  const managerPasswordHash = await bcrypt.hash("manager123", 10);
  const ownerPinHash = await bcrypt.hash("9999", 10);
  const managerPinHash = await bcrypt.hash("5678", 10);
  const clerkPinHash = await bcrypt.hash("1234", 10);

  await prisma.user.create({
    data: {
      warehouseId: warehouse.id,
      name: "Faisal Sheikh",
      email: "owner@alnoor.pk",
      passwordHash: ownerPasswordHash,
      pinHash: ownerPinHash,
      role: "OWNER" as UserRoleType,
    },
  });

  await prisma.user.create({
    data: {
      warehouseId: warehouse.id,
      name: "Bilal Ahmed",
      email: "manager@alnoor.pk",
      passwordHash: managerPasswordHash,
      pinHash: managerPinHash,
      role: "MANAGER" as UserRoleType,
    },
  });

  await prisma.user.create({
    data: {
      warehouseId: warehouse.id,
      name: "Ahmed Khan",
      role: "CLERK" as UserRoleType,
      pinHash: clerkPinHash,
    },
  });

  // --- Units ---
  const kg = await prisma.unit.create({
    data: { warehouseId: warehouse.id, code: "KG", name: "Kilogram", type: "WEIGHT", factorToBase: 1 },
  });
  await prisma.unit.create({
    data: { warehouseId: warehouse.id, code: "G", name: "Gram", type: "WEIGHT", baseUnitId: kg.id, factorToBase: 0.001 },
  });
  const bag50 = await prisma.unit.create({
    data: { warehouseId: warehouse.id, code: "BAG50", name: "Bag (50kg)", type: "WEIGHT", baseUnitId: kg.id, factorToBase: 50 },
  });
  const bag25 = await prisma.unit.create({
    data: { warehouseId: warehouse.id, code: "BAG25", name: "Bag (25kg)", type: "WEIGHT", baseUnitId: kg.id, factorToBase: 25 },
  });
  const bag20 = await prisma.unit.create({
    data: { warehouseId: warehouse.id, code: "BAG20", name: "Bag (20kg)", type: "WEIGHT", baseUnitId: kg.id, factorToBase: 20 },
  });
  const l = await prisma.unit.create({
    data: { warehouseId: warehouse.id, code: "L", name: "Litre", type: "VOLUME", factorToBase: 1 },
  });
  const bottle5l = await prisma.unit.create({
    data: { warehouseId: warehouse.id, code: "BTL5L", name: "Bottle (5L)", type: "VOLUME", baseUnitId: l.id, factorToBase: 5 },
  });
  await prisma.unit.create({
    data: { warehouseId: warehouse.id, code: "PCS", name: "Piece", type: "COUNT", factorToBase: 1 },
  });

  // --- Categories ---
  const catGrocery = await prisma.category.create({
    data: { warehouseId: warehouse.id, name: "Grocery", sortOrder: 1, colorHex: "#f3562c" },
  });
  const catVeg = await prisma.category.create({
    data: {
      warehouseId: warehouse.id,
      name: "Vegetables",
      sortOrder: 2,
      isPerishable: true,
      defaultReturnWindowHours: 12,
      colorHex: "#15803d",
    },
  });
  const catSpices = await prisma.category.create({
    data: { warehouseId: warehouse.id, name: "Spices", sortOrder: 3, colorHex: "#b45309" },
  });
  const catOil = await prisma.category.create({
    data: { warehouseId: warehouse.id, name: "Oil & Ghee", sortOrder: 4, colorHex: "#0a0a0a" },
  });
  const catDairy = await prisma.category.create({
    data: {
      warehouseId: warehouse.id,
      name: "Dairy",
      sortOrder: 5,
      isPerishable: true,
      defaultReturnWindowHours: 6,
      colorHex: "#0369a1",
    },
  });

  // --- Items ---
  // Sugar gets the two-lot moving-average history from SPEC.md / docs/02-costing-engine.md,
  // reproduced exactly so the seed data matches the documented worked example.
  const sugar = await prisma.item.create({
    data: {
      warehouseId: warehouse.id,
      name: "Sugar (Refined)",
      categoryId: catGrocery.id,
      purchaseUnitId: bag50.id,
      sellUnitId: kg.id,
      purchaseToSellFactor: 50,
      baseSellPrice: 160,
      currentStockQty: 0,
      avgCostPerUnit: 0,
    },
  });

  const avgAfterMonday = calculateMovingAverage(0, 0, 50, 140);
  await prisma.item.update({
    where: { id: sugar.id },
    data: { currentStockQty: 50, avgCostPerUnit: avgAfterMonday.toNumber() },
  });
  await prisma.stockMovement.create({
    data: {
      warehouseId: warehouse.id,
      itemId: sugar.id,
      type: "PURCHASE_RECEIVED",
      qty: 50,
      qtyBefore: 0,
      qtyAfter: 50,
      unitCost: 140,
      totalCost: 7000,
      avgCostBefore: 0,
      avgCostAfter: avgAfterMonday.toNumber(),
      performedByName: "Ahmed Khan",
      reason: "Monday delivery",
      createdAt: daysAgo(4),
    },
  });
  await prisma.purchaseLot.create({
    data: {
      warehouseId: warehouse.id,
      itemId: sugar.id,
      receivedQty: 50,
      remainingQty: 50,
      unitCost: 140,
      totalCost: 7000,
      receivedAt: daysAgo(4),
      batchNumber: "SUG-MON-01",
    },
  });

  const avgAfterThursday = calculateMovingAverage(50, avgAfterMonday.toNumber(), 30, 152);
  await prisma.item.update({
    where: { id: sugar.id },
    data: { currentStockQty: 80, avgCostPerUnit: avgAfterThursday.toNumber() },
  });
  await prisma.stockMovement.create({
    data: {
      warehouseId: warehouse.id,
      itemId: sugar.id,
      type: "PURCHASE_RECEIVED",
      qty: 30,
      qtyBefore: 50,
      qtyAfter: 80,
      unitCost: 152,
      totalCost: 4560,
      avgCostBefore: avgAfterMonday.toNumber(),
      avgCostAfter: avgAfterThursday.toNumber(),
      performedByName: "Ahmed Khan",
      reason: "Thursday delivery (market price rise)",
      createdAt: daysAgo(1),
    },
  });
  await prisma.purchaseLot.create({
    data: {
      warehouseId: warehouse.id,
      itemId: sugar.id,
      receivedQty: 30,
      remainingQty: 30,
      unitCost: 152,
      totalCost: 4560,
      receivedAt: daysAgo(1),
      batchNumber: "SUG-THU-01",
    },
  });

  await createItemWithOpeningStock({
    warehouseId: warehouse.id,
    name: "Cooking Oil (Dalda)",
    categoryId: catOil.id,
    purchaseUnitId: bottle5l.id,
    sellUnitId: l.id,
    purchaseToSellFactor: 5,
    baseSellPrice: 360,
    openingQty: 22,
    openingCost: 310,
    performedByName: "Ahmed Khan",
  });

  await createItemWithOpeningStock({
    warehouseId: warehouse.id,
    name: "Tomato (Fresh)",
    categoryId: catVeg.id,
    purchaseUnitId: kg.id,
    sellUnitId: kg.id,
    purchaseToSellFactor: 1,
    baseSellPrice: 100,
    openingQty: 4,
    openingCost: 72.5,
    isPerishable: true,
    shelfLifeDays: 3,
    returnWindowHours: 12,
    minStockQty: 20,
    performedByName: "Ahmed Khan",
  });

  await createItemWithOpeningStock({
    warehouseId: warehouse.id,
    name: "Onion",
    categoryId: catVeg.id,
    purchaseUnitId: kg.id,
    sellUnitId: kg.id,
    purchaseToSellFactor: 1,
    baseSellPrice: 90,
    openingQty: 120,
    openingCost: 68,
    isPerishable: true,
    shelfLifeDays: 14,
    returnWindowHours: 24,
    minStockQty: 30,
    performedByName: "Ahmed Khan",
  });

  await createItemWithOpeningStock({
    warehouseId: warehouse.id,
    name: "Basmati Rice",
    categoryId: catGrocery.id,
    purchaseUnitId: bag50.id,
    sellUnitId: kg.id,
    purchaseToSellFactor: 50,
    baseSellPrice: 240,
    openingQty: 85,
    openingCost: 205,
    performedByName: "Ahmed Khan",
  });

  await createItemWithOpeningStock({
    warehouseId: warehouse.id,
    name: "Red Chilli Powder",
    categoryId: catSpices.id,
    purchaseUnitId: kg.id,
    sellUnitId: kg.id,
    purchaseToSellFactor: 1,
    baseSellPrice: 800,
    openingQty: 0,
    openingCost: 650,
    minStockQty: 10,
    performedByName: "Ahmed Khan",
  });

  await createItemWithOpeningStock({
    warehouseId: warehouse.id,
    name: "Wheat Flour (Atta)",
    categoryId: catGrocery.id,
    purchaseUnitId: bag20.id,
    sellUnitId: kg.id,
    purchaseToSellFactor: 20,
    baseSellPrice: 130,
    openingQty: 200,
    openingCost: 108,
    performedByName: "Ahmed Khan",
  });

  await createItemWithOpeningStock({
    warehouseId: warehouse.id,
    name: "Salt",
    categoryId: catGrocery.id,
    purchaseUnitId: bag25.id,
    sellUnitId: kg.id,
    purchaseToSellFactor: 25,
    baseSellPrice: 45,
    openingQty: 150,
    openingCost: 32,
    performedByName: "Ahmed Khan",
  });

  await createItemWithOpeningStock({
    warehouseId: warehouse.id,
    name: "Milk (Fresh)",
    categoryId: catDairy.id,
    purchaseUnitId: l.id,
    sellUnitId: l.id,
    purchaseToSellFactor: 1,
    baseSellPrice: 190,
    openingQty: 40,
    openingCost: 165,
    isPerishable: true,
    shelfLifeDays: 2,
    returnWindowHours: 6,
    minStockQty: 15,
    performedByName: "Ahmed Khan",
  });

  await createItemWithOpeningStock({
    warehouseId: warehouse.id,
    name: "Black Pepper (Whole)",
    categoryId: catSpices.id,
    purchaseUnitId: kg.id,
    sellUnitId: kg.id,
    purchaseToSellFactor: 1,
    baseSellPrice: 2400,
    openingQty: 8,
    openingCost: 2000,
    performedByName: "Ahmed Khan",
  });

  // --- Customers ---
  await createCustomerWithOpeningBalance({
    warehouseId: warehouse.id,
    name: "Al-Madina Restaurant",
    code: "CUS-001",
    phone: "0321-9876543",
    creditLimit: 50000,
    openingBalance: 2900,
    balanceAgeDays: 4,
  });

  await createCustomerWithOpeningBalance({
    warehouseId: warehouse.id,
    name: "Bismillah Restaurant",
    code: "CUS-002",
    phone: "0333-1122334",
    creditLimit: 30000,
    openingBalance: 5400,
    balanceAgeDays: 20,
  });

  await createCustomerWithOpeningBalance({
    warehouseId: warehouse.id,
    name: "Karachi Grill",
    code: "CUS-003",
    phone: "0300-5566778",
    creditLimit: 40000,
    openingBalance: 6600,
    balanceAgeDays: 65,
  });

  await createCustomerWithOpeningBalance({
    warehouseId: warehouse.id,
    name: "New Town Kitchen",
    code: "CUS-004",
    phone: "0345-9988776",
    creditLimit: 20000,
    openingBalance: 0,
    balanceAgeDays: 0,
  });

  await createCustomerWithOpeningBalance({
    warehouseId: warehouse.id,
    name: "Walk-in Customer",
    code: "WALKIN",
    type: "WALK_IN",
    creditLimit: 0,
    creditDays: 0,
    openingBalance: 0,
    balanceAgeDays: 0,
  });

  // --- Suppliers ---
  await prisma.supplier.createMany({
    data: [
      { warehouseId: warehouse.id, name: "Karachi Wholesale Market", phone: "021-34567890" },
      { warehouseId: warehouse.id, name: "Metro Distributors", phone: "021-98765432" },
      { warehouseId: warehouse.id, name: "Sabzi Mandi Suppliers", phone: "0300-1231231" },
    ],
  });

  console.log("Seed complete.");
  console.log(`Warehouse: ${warehouse.name} (${warehouse.id})`);
  console.log("Login as owner:   owner@alnoor.pk / owner123  (PIN 9999)");
  console.log("Login as manager: manager@alnoor.pk / manager123  (PIN 5678)");
  console.log("Login as clerk:   Ahmed Khan, PIN 1234");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
