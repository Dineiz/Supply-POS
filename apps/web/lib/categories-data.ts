export interface SupplyCategory {
  id: string;
  name: string;
  nameUrdu: string;
  tagline: string;
  badge: string;
  colorHex: string;
  iconName: string;
  mandiSource: string;
  typicalUnits: string[];
  shelfLife: string;
  description: string;
  popularItems: {
    name: string;
    nameUrdu: string;
    unit: string;
    avgPrice: string;
    stockStatus: "High" | "Medium" | "Limited";
  }[];
}

export const SUPPLY_CATEGORIES: SupplyCategory[] = [
  {
    id: "cat_gosht",
    name: "Gosht & Tollinton Poultry",
    nameUrdu: "گوشت اور مرغی",
    tagline: "Daily cold-chain certified broiler, mutton cuts, and beef veal",
    badge: "Cold-Chain Certified",
    colorHex: "#DC2626",
    iconName: "meat",
    mandiSource: "Tollinton Poultry Market & Bakar Mandi",
    typicalUnits: ["KG (کلو)", "CRATE (کریٹ)", "MAN (من 40kg)"],
    shelfLife: "24 - 48 Hours (0°C to 4°C)",
    description:
      "Direct slaughterhouse procurement with mandatory chill-temperature logging upon arrival. Cleaned broiler poultry (صافی مرغی) and premium mutton karahi cut with lot-specific expiry dates.",
    popularItems: [
      { name: "Cleaned Broiler Chicken", nameUrdu: "صافی برائلر مرغی گوشت", unit: "KG", avgPrice: "Rs. 620", stockStatus: "High" },
      { name: "Mutton Karahi Cut Mix", nameUrdu: "بکرا مکس کڑاہی کٹ", unit: "KG", avgPrice: "Rs. 2,300", stockStatus: "Medium" },
      { name: "Veal Beef Boneless", nameUrdu: "بچھیا بون لیس گوشت", unit: "KG", avgPrice: "Rs. 1,450", stockStatus: "High" },
    ],
  },
  {
    id: "cat_mandi",
    name: "Sabzi Mandi & Fresh Produce",
    nameUrdu: "سبزی منڈی و تازہ پیداوار",
    tagline: "Grade-A vegetables sourced before dawn from Badami Bagh & Subzazar",
    badge: "Daily Mandi Fresh",
    colorHex: "#16A34A",
    iconName: "leaf",
    mandiSource: "Badami Bagh & Allama Iqbal Town Sabzi Mandi",
    typicalUnits: ["KG (کلو)", "BORI (بوری)", "PETI (پیٹی)"],
    shelfLife: "2 - 4 Days",
    description:
      "Weighed on calibrated digital warehouse scales with immediate sorting to prevent moisture rot. Automated moving-average costing adjusts immediately to daily mandi bidding prices.",
    popularItems: [
      { name: "Farm Fresh Tomatoes Grade-A", nameUrdu: "ٹماٹر گریڈ اے", unit: "KG", avgPrice: "Rs. 150", stockStatus: "High" },
      { name: "Desi Red Onions (Sindh)", nameUrdu: "دیسی لال پیاز", unit: "KG", avgPrice: "Rs. 175", stockStatus: "High" },
      { name: "Crushed Ginger & Garlic Paste", nameUrdu: "ادرک لہسن پیسٹ", unit: "KG", avgPrice: "Rs. 490", stockStatus: "Medium" },
    ],
  },
  {
    id: "cat_dairy",
    name: "Doodh, Dahi & Gawalmandi Khoya",
    nameUrdu: "دودھ، دہی اور کھویا",
    tagline: "High-fat dairy essentials for commercial karahis, gravies & sweets",
    badge: "Pure Fat Tested",
    colorHex: "#EA580C",
    iconName: "milk",
    mandiSource: "Gawalmandi Dairy & Farm Fresh Collectives",
    typicalUnits: ["L (لیٹر)", "KG (کلو)", "KUNDA (کنڈا)"],
    shelfLife: "24 - 72 Hours",
    description:
      "Strict lactometer & fat-percentage testing upon dock receipt. Fresh kunda dahi with high consistency for restaurant gravies and marination, plus 100% pure unsweetened khoya.",
    popularItems: [
      { name: "Fresh Kunda Dahi", nameUrdu: "کنڈے والا تازہ دہی", unit: "KG", avgPrice: "Rs. 230", stockStatus: "High" },
      { name: "Traditional Pure Khoya", nameUrdu: "گوالمنڈی دیسی کھویا", unit: "KG", avgPrice: "Rs. 1,200", stockStatus: "Medium" },
      { name: "Pure Desi Makhan & Ghee", nameUrdu: "خالص مکھن و دیسی گھی", unit: "KG", avgPrice: "Rs. 2,550", stockStatus: "Limited" },
    ],
  },
  {
    id: "cat_ration",
    name: "Akbari Mandi Grains & Ration",
    nameUrdu: "اکبری منڈی راشن و مصالحہ",
    tagline: "Wholesale staple grains, 16L tin oils, and whole spices in bulk boriyan",
    badge: "Wholesale Bulk",
    colorHex: "#78350F",
    iconName: "wheat",
    mandiSource: "Akbari Mandi, Lahore",
    typicalUnits: ["BORI 50kg (بوری)", "TIN 16L (ٹن)", "CARTON (کاٹن)"],
    shelfLife: "6 - 12 Months",
    description:
      "Bulk moisture-sealed storage with automated purchase-to-sell conversion (e.g., receiving 50kg boriyan and issuing exact decimal kilograms to branches with zero conversion loss).",
    popularItems: [
      { name: "Kainat 1121 Steam Rice 50kg", nameUrdu: "کائنات سپر اسٹیم چاول", unit: "KG", avgPrice: "Rs. 380", stockStatus: "High" },
      { name: "Habib 16L Cooking Oil Tin", nameUrdu: "حبیب بناسپتی گھی ٹن", unit: "ADAD", avgPrice: "Rs. 8,850", stockStatus: "High" },
      { name: "Whole Sabut Garam Masala Mix", nameUrdu: "ثابت گرم مصالحہ جات", unit: "KG", avgPrice: "Rs. 1,850", stockStatus: "Medium" },
    ],
  },
];
