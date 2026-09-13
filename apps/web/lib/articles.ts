export interface Article {
  slug: string;
  title: string;
  titleUrdu?: string;
  excerpt: string;
  category: string;
  readTime: string;
  publishedAt: string;
  author: {
    name: string;
    role: string;
  };
  content: {
    intro: string;
    sections: {
      heading: string;
      body: string;
      bulletPoints?: string[];
      highlight?: string;
    }[];
    conclusion: string;
  };
}

export const ARTICLES: Article[] = [
  {
    slug: "scaling-central-kitchens-pakistan",
    title: "Scaling Central Kitchens & Restaurant Warehouses in Pakistan: Beyond Manual Khatas",
    titleUrdu: "سینٹرل کچن اور ہول سیل سپلائی کا جدید نظام",
    excerpt:
      "How multi-unit restaurant operators across Lahore, Karachi, and Islamabad eliminate dispatch discrepancies, control supplier rate spikes, and enforce credit ceilings.",
    category: "Supply Chain Strategy",
    readTime: "6 min read",
    publishedAt: "September 2026",
    author: {
      name: "Dineiz Operations Group",
      role: "Logistics & Food Supply Advisory",
    },
    content: {
      intro:
        "The traditional Pakistani restaurant supply chain has long depended on carbon-copy parchas, handwritten munshi khatas, and verbal rate agreements at Sabzi Mandi and Akbari Mandi. While this works for a single eatery, the moment a restaurant group expands to three or more branches, manual tracking causes catastrophic margin leakage.",
      sections: [
        {
          heading: "The Multi-Branch Sourcing Bottleneck",
          body: "When branch chefs order individually from separate street vendors, purchasing power is fragmented. A centralized commissary or warehouse solves this by purchasing in bulk (Maunds and Boriyan) directly from primary mandis, receiving goods under strict quality gates, and dispatching daily quotas to branches.",
          bulletPoints: [
            "Centralized procurement yields 14% to 22% lower cost per kilogram on staple commodities.",
            "Eliminates duplicate deliveries and unauthorized chef kickbacks at the branch back-door.",
            "Enables precise standardized recipe costing across all restaurant locations.",
          ],
        },
        {
          heading: "Delivery Slips vs. Cashier Reconciliation",
          body: "A frequent point of friction occurs between warehouse delivery clerks and branch receiving managers over alleged missing quantities (e.g., chicken weight loss or vegetable dehydration). Dineiz Supply introduces idempotent picking slips and dual-sign delivery notes with 80mm thermal receipts.",
          highlight:
            "Every dispatch slip has an unalterable timestamp, issuing clerk name, and digital receiving signature, making audit disputes virtually impossible.",
        },
        {
          heading: "Enforcing Customer & Branch Credit Ceilings",
          body: "Whether supplying internal franchise branches or external catering clients, credit risks must be programmatically capped. When a customer exceeds their credit days or financial balance limit, Dineiz Supply blocks unauthorized dispatches unless explicitly overridden with a Manager PIN and logged audit reason.",
        },
      ],
      conclusion:
        "Moving from reactive ledger reconciliation to a proactive warehouse terminal is the single highest-ROI infrastructure investment a scaling food brand can make.",
    },
  },
  {
    slug: "weighted-average-costing-mandi-inflation",
    title: "Why FIFO Fails in Volatile Food Markets: The Case for Moving-Average Costing",
    titleUrdu: "منڈی کی قیمتوں میں اتار چڑھاؤ اور موونگ ایوریج لاگت",
    excerpt:
      "Why First-In-First-Out accounting distorts food profit margins during daily vegetable and chicken price swings, and how moving-average costing protects your bottom line.",
    category: "Cost Engineering",
    readTime: "5 min read",
    publishedAt: "September 2026",
    author: {
      name: "Tariq Farooq",
      role: "Chief Financial Controller, Dineiz POS",
    },
    content: {
      intro:
        "In countries with stable wholesale prices, First-In-First-Out (FIFO) is standard inventory practice. But in Pakistan, where tomato prices can jump from PKR 90 to PKR 180 per kg within 48 hours due to supply shocks, FIFO creates dangerous pricing illusions.",
      sections: [
        {
          heading: "The FIFO Distortion Problem",
          body: "Under FIFO, issuing old stock at PKR 90 while current replacement cost is PKR 180 makes kitchen margins look artificially high. Once that lot runs out, food cost metrics violently spike, blindsiding management.",
          bulletPoints: [
            "FIFO creates artificial profit spikes followed by sudden catastrophic margin collapses.",
            "Fails to reflect the real replenishment capital needed to purchase the next batch.",
            "Leaves kitchen managers unaware of which menu items need immediate rate adjustments.",
          ],
        },
        {
          heading: "How Moving-Average Costing (MAC) Solves It",
          body: "Dineiz Supply implements continuous Weighted Moving Average Costing. Every time a new Goods Receipt is entered, the system recalculates the average unit cost across existing stock and newly received goods in real time.",
          highlight:
            "Formula: New Avg Cost = (Old Stock Qty × Old Avg Cost + Received Qty × Received Unit Cost) ÷ (Old Qty + Received Qty)",
        },
        {
          heading: "Protecting the Margin Floor",
          body: "With real-time moving average costs automatically tied to each sellable item, the counter terminal automatically enforces a margin floor (e.g. 15% above cost). If an operator tries to issue an item below cost, the terminal alerts the operator immediately.",
        },
      ],
      conclusion:
        "Continuous moving average costing provides an unvarnished, accurate view of kitchen profitability regardless of daily inflation fluctuations.",
    },
  },
  {
    slug: "curbing-kitchen-wastage-perishables",
    title: "Cutting Perishable Food Loss by 35%: Cold-Chain Auditing & Variance Gates",
    titleUrdu: "خراب مال اور ضیاع کی روک تھام کا طریقہ کار",
    excerpt:
      "Actionable protocols for receiving dairy, poultry, and vegetables with strict variance thresholds, photo evidence, and expiration date tracking.",
    category: "Warehouse Operations",
    readTime: "7 min read",
    publishedAt: "September 2026",
    author: {
      name: "Khurram Shahzad",
      role: "Head of Supply Chain Audits",
    },
    content: {
      intro:
        "Perishable food wastage is the silent profit killer in restaurant logistics. Between improper receiving temperatures, overlooked shelf life, and unrecorded kitchen spoilage, typical operations lose 4% to 9% of their gross inventory value each month.",
      sections: [
        {
          heading: "The Gatekeeper Rule: Strict Goods Receipt Inspections",
          body: "Wastage control does not start in the refrigerator—it starts at the delivery dock. When suppliers deliver chicken or fresh milk, clerks must log temperature, expiry date, and weight before stock is committed to the warehouse.",
          bulletPoints: [
            "Automatic variance flagging if supplier invoiced rate exceeds recent purchase order estimates by >5%.",
            "Mandatory lot batch numbers and expiry dates for all dairy and poultry items.",
            "Immediate return slip generation for rejected or sub-par crates.",
          ],
        },
        {
          heading: "Formal Wastage Logging with Photo Attribution",
          body: "Throwing spoiled tomatoes or sour milk into the bin without an audit trail invites theft and negligence. In Dineiz Supply, logging wastage requires attributing the cause (spoiled, expired, pest, theft) and responsible entity (warehouse, supplier, or customer return).",
          highlight:
            "Any single wastage incident exceeding PKR 2,000 requires an electronic Manager Override approval and photo evidence.",
        },
        {
          heading: "Expiry Radar & Proactive Dispatch",
          body: "Instead of discovering expired blocks of cheese during month-end stock count, the Expiry Report flags batches that are within 48 hours of expiration. Warehouse managers can proactively discount or prioritize dispatching these batches to high-volume branches first.",
        },
      ],
      conclusion:
        "Discipline at the receiving dock paired with systematic loss attribution turns perishable management into a predictable, controlled operation.",
    },
  },
];
