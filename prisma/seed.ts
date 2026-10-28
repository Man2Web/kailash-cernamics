import prisma from "../src/lib/db/db";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Starting database seeding for Geetha Ceramics...");

  // Reset database before seeding to ensure idempotency
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE 
      "companies", 
      "branches", 
      "outlets", 
      "warehouses", 
      "warehouse_locations", 
      "racks", 
      "bins", 
      "users", 
      "chart_of_accounts", 
      "ledgers", 
      "categories", 
      "brands", 
      "units", 
      "products", 
      "product_variants", 
      "stock", 
      "inventory_transactions", 
      "inventory_ledger", 
      "customers", 
      "customer_addresses", 
      "vendors", 
      "vendor_addresses",
      "quotations",
      "quotation_items",
      "sales_orders",
      "sales_order_items",
      "invoices",
      "invoice_items",
      "purchase_orders",
      "purchase_order_items",
      "purchase_bills",
      "purchase_bill_items",
      "goods_receipts",
      "goods_receipt_items",
      "approval_workflows",
      "approval_workflow_steps",
      "approval_requests",
      "approval_history",
      "tax_transactions",
      "journal_entries",
      "journal_entry_items",
      "support_tickets",
      "portal_announcements",
      "helpdesk_articles",
      "employees",
      "vehicle_movements",
      "roles",
      "permissions",
      "user_roles",
      "role_permissions"
    CASCADE;
  `);

  // 1. Create Company
  const company = await prisma.company.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Geetha Ceramics Group Ltd",
      gstin: "33AAACG1234A1Z1",
      pan: "AAACG1234A",
      email: "info@geethaceramics.com",
      phone: "+91 98765 43210",
      address: "12, Main Bazaar Road, Vellore, Tamil Nadu, 632001",
    },
  });
  console.log("Seeded Company:", company.name);

  // 2. Create Branches
  const branchVellore = await prisma.branch.upsert({
    where: { code: "BR-VELLORE" },
    update: {},
    create: {
      companyId: company.id,
      name: "Vellore Branch",
      code: "BR-VELLORE",
      address: "Vellore, Tamil Nadu",
    },
  });

  const branchChennai = await prisma.branch.upsert({
    where: { code: "BR-CHENNAI" },
    update: {},
    create: {
      companyId: company.id,
      name: "Chennai Branch",
      code: "BR-CHENNAI",
      address: "Chennai, Tamil Nadu",
    },
  });
  console.log("Seeded Branches: Vellore, Chennai");

  // 3. Create Outlets
  const outletVellore = await prisma.outlet.upsert({
    where: { code: "OUT-VELLORE-RET" },
    update: {},
    create: {
      branchId: branchVellore.id,
      name: "Vellore Retail Outlet",
      code: "OUT-VELLORE-RET",
      gstin: company.gstin,
      address: company.address,
    },
  });

  const outletChennai = await prisma.outlet.upsert({
    where: { code: "OUT-CHENNAI-SHOW" },
    update: {},
    create: {
      branchId: branchChennai.id,
      name: "Chennai Main Showroom",
      code: "OUT-CHENNAI-SHOW",
      gstin: "33AAACG1234A2Z2",
      address: "Mount Road, Chennai, Tamil Nadu",
    },
  });
  console.log("Seeded Outlets: Vellore Retail, Chennai Showroom");

  // 4. Create Warehouses
  const whVellore = await prisma.warehouse.upsert({
    where: { code: "WH-VELLORE" },
    update: {},
    create: {
      branchId: branchVellore.id,
      name: "Vellore Warehouse",
      code: "WH-VELLORE",
      address: "Katpadi, Vellore, Tamil Nadu",
    },
  });

  const whChennai = await prisma.warehouse.upsert({
    where: { code: "WH-CHENNAI" },
    update: {},
    create: {
      branchId: branchChennai.id,
      name: "Chennai Warehouse",
      code: "WH-CHENNAI",
      address: "Guindy, Chennai, Tamil Nadu",
    },
  });
  console.log("Seeded Warehouses: Vellore WH, Chennai WH");

  // 5. Create default Warehouse layout under Vellore
  const locGf = await prisma.warehouseLocation.create({
    data: {
      warehouseId: whVellore.id,
      name: "Ground Floor",
      code: "LOC-GF",
    },
  });

  const rackA = await prisma.rack.create({
    data: {
      locationId: locGf.id,
      name: "Rack A",
      code: "RCK-A",
    },
  });

  const bin01 = await prisma.bin.create({
    data: {
      rackId: rackA.id,
      name: "Bin 1",
      code: "BIN-01",
    },
  });
  console.log("Seeded Warehouse layouts (GF -> Rack A -> Bin 1)");

  // 6. Seed default User (Admin) and Roles/Permissions
  const initialAdminPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!initialAdminPassword || initialAdminPassword.length < 12) {
    throw new Error("Set ADMIN_INITIAL_PASSWORD (min 12 characters) to seed the initial administrator.");
  }
  const passwordHash = await bcrypt.hash(initialAdminPassword, 10);
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@geethaceramics.com" },
    update: {},
    create: {
      email: "admin@geethaceramics.com",
      name: "Super Admin",
      passwordHash,
      status: "ACTIVE",
    },
  });
  console.log("Seeded initial administrator (password taken from ADMIN_INITIAL_PASSWORD; existing users are not modified)");

  // Seed Roles
  const rolesList = [
    "SUPER_ADMIN", "ADMIN", "SALES_MANAGER", "SALES_STAFF",
    "PURCHASE_MANAGER", "PURCHASE_STAFF", "WAREHOUSE_MANAGER",
    "INVENTORY_STAFF", "FINANCE_MANAGER", "ACCOUNTANT",
    "DELIVERY_STAFF", "VIEWER"
  ];
  const dbRoles: Record<string, any> = {};
  for (const roleName of rolesList) {
    dbRoles[roleName] = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: {
        name: roleName,
        description: `${roleName.replace("_", " ")} role for SixOrbit ERP`,
      },
    });
  }
  console.log("Seeded ERP Roles:", Object.keys(dbRoles));

  // Map Admin to SUPER_ADMIN
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: dbRoles["SUPER_ADMIN"].id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: dbRoles["SUPER_ADMIN"].id,
    },
  });
  console.log("Associated admin@geethaceramics.com to SUPER_ADMIN role");

  // 7. Seed Chart of Accounts & default Ledgers
  const DEFAULT_COA = [
    { code: "1200", name: "Accounts Receivable (Customers)", type: "ASSET" },
    { code: "2100", name: "Accounts Payable (Vendors)", type: "LIABILITY" },
    { code: "4100", name: "Sales Revenue", type: "INCOME" },
    { code: "5100", name: "Purchase Expense", type: "EXPENSE" },
    { code: "1300", name: "Input CGST", type: "ASSET" },
    { code: "1301", name: "Input SGST", type: "ASSET" },
    { code: "1302", name: "Input IGST", type: "ASSET" },
    { code: "2200", name: "Output CGST", type: "LIABILITY" },
    { code: "2201", name: "Output SGST", type: "LIABILITY" },
    { code: "2202", name: "Output IGST", type: "LIABILITY" },
    { code: "3100", name: "Share Capital", type: "EQUITY" },
  ];

  for (const acc of DEFAULT_COA) {
    const coa = await prisma.chartOfAccount.upsert({
      where: { code: acc.code },
      update: {},
      create: {
        code: acc.code,
        name: acc.name,
        type: acc.type,
      },
    });

    const existingLedger = await prisma.ledger.findFirst({
      where: { accountId: coa.id },
    });
    if (!existingLedger) {
      await prisma.ledger.create({
        data: {
          accountId: coa.id,
          balance: 0,
        },
      });
    }
  }
  console.log("Seeded Chart of Accounts and default Ledger balances");

  // 8. Seed Categories, Brands & Units
  const catTiles = await prisma.category.upsert({
    where: { code: "CAT-TILES" },
    update: {},
    create: { name: "Ceramic Tiles", code: "CAT-TILES" },
  });

  const catAlum = await prisma.category.upsert({
    where: { code: "CAT-ALUM" },
    update: {},
    create: { name: "Aluminium Sections", code: "CAT-ALUM" },
  });

  const brandKaj = await prisma.brand.upsert({
    where: { code: "BR-KAJ" },
    update: {},
    create: { name: "Kajaria", code: "BR-KAJ" },
  });

  const unitSqft = await prisma.unit.upsert({
    where: { code: "SQFT" },
    update: {},
    create: { name: "Square Feet", code: "SQFT" },
  });

  const unitBox = await prisma.unit.upsert({
    where: { code: "BOX" },
    update: {},
    create: { name: "Box", code: "BOX" },
  });
  console.log("Seeded Categories, Brands, and Units");

  // 9. Seed Products
  const prodTiles = await prisma.product.create({
    data: {
      name: "Kajaria White Glossy 12x12",
      sku: "KA-WT-12X12",
      code: "PRD0001",
      hsnCode: "6907",
      categoryId: catTiles.id,
      brandId: brandKaj.id,
      unitId: unitBox.id,
      purchasePrice: 150.0,
      sellingPrice: 220.0,
      mrp: 250.0,
      gstRate: 18.0,
      minStock: 20,
      reorderLevel: 50,
    },
  });

  const variantTiles = await prisma.productVariant.create({
    data: {
      productId: prodTiles.id,
      name: "Standard",
      sku: prodTiles.sku,
      barcode: prodTiles.sku,
    },
  });

  // Load opening stock
  const openingStock = await prisma.stock.create({
    data: {
      productId: prodTiles.id,
      variantId: variantTiles.id,
      warehouseId: whVellore.id,
      binId: bin01.id,
      quantity: 500, // 500 boxes opening stock
    },
  });

  const opTrans = await prisma.inventoryTransaction.create({
    data: {
      docType: "OPENING_STOCK",
      docId: prodTiles.id,
      transactionNo: `OP-PRD0001`,
      remarks: "Opening Stock initialization",
    },
  });

  await prisma.inventoryLedger.create({
    data: {
      transactionId: opTrans.id,
      variantId: variantTiles.id,
      warehouseId: whVellore.id,
      binId: bin01.id,
      quantity: 500,
    },
  });

  console.log("Seeded Product: Kajaria Tiles with 500 Boxes Opening Stock");

  // 10. Seed Customer Groups and Customers
  const groupWholesale = await prisma.customerGroup.upsert({
    where: { name: "Wholesale Buyers" },
    update: {},
    create: { name: "Wholesale Buyers", discountPercent: 10.0 },
  });

  const custGeetha = await prisma.customer.upsert({
    where: { code: "CUST-GEETHA" },
    update: {},
    create: {
      groupId: groupWholesale.id,
      name: "Geetha Ceramics House",
      code: "CUST-GEETHA",
      gstin: "33AAACG1111A1Z1",
      email: "billing@geethaceramics.com",
      phone: "9876543210",
      creditLimit: 500000.0,
    },
  });

  await prisma.customerAddress.create({
    data: {
      customerId: custGeetha.id,
      type: "BILLING",
      address: "15, Katpadi Road, Vellore",
      city: "Vellore",
      state: "Tamil Nadu",
      pincode: "632007",
      isDefault: true,
    },
  });

  const custInter = await prisma.customer.upsert({
    where: { code: "CUST-BANGALORE" },
    update: {},
    create: {
      groupId: groupWholesale.id,
      name: "Bangalore Granite & Tiles",
      code: "CUST-BANGALORE",
      gstin: "29BBBCG2222B2Z2",
      email: "bangalore@tiles.com",
      phone: "9988776655",
      creditLimit: 200000.0,
    },
  });

  await prisma.customerAddress.create({
    data: {
      customerId: custInter.id,
      type: "SHIPPING",
      address: "56, Indiranagar Double Road, Bangalore",
      city: "Bangalore",
      state: "Karnataka",
      pincode: "560038",
      isDefault: true,
    },
  });
  console.log("Seeded Customers: Geetha Ceramics (Vellore), Bangalore Granite (Karnataka)");

  // 11. Seed Vendors
  const vendorKaj = await prisma.vendor.upsert({
    where: { code: "VEND-KAJARIA" },
    update: {},
    create: {
      name: "Kajaria Ceramics Corporate Office",
      code: "VEND-KAJARIA",
      gstin: "24DDDCG3333C3Z3",
      email: "purchase@kajaria.com",
      phone: "011-22334455",
    },
  });

  await prisma.vendorAddress.create({
    data: {
      vendorId: vendorKaj.id,
      type: "BILLING",
      address: "J-1/B-1 (Extn.), Mohan Co-op. Industrial Estate",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110044",
    },
  });
  console.log("Seeded Supplier (Vendor): Kajaria Ceramics");

  // 12. Seed New System Modules Data
  
  // Seed Support Tickets
  await prisma.supportTicket.createMany({
    data: [
      {
        ticketNo: "TCK-1001",
        customerId: custGeetha.id,
        subject: "Delay in Ceramic Tiles Shipment",
        description: "Customer reports Vellore order is delayed by 3 days. Needs priority tracking.",
        priority: "HIGH",
        status: "OPEN",
        assignedToId: adminUser.id,
      },
      {
        ticketNo: "TCK-1002",
        customerId: custInter.id,
        subject: "Incorrect Invoice Discount Applied",
        description: "Wholesale buyer complains that standard 10% customer group discount was not active.",
        priority: "MEDIUM",
        status: "IN_PROGRESS",
        assignedToId: adminUser.id,
      },
      {
        ticketNo: "TCK-1003",
        customerId: custGeetha.id,
        subject: "Damaged Sanitaryware Items Delivered",
        description: "2 Kajaria bathroom bowls received in cracked state. Replacements needed.",
        priority: "URGENT",
        status: "OPEN",
      },
      {
        ticketNo: "TCK-1004",
        customerId: custInter.id,
        subject: "General Portal Login Guidance",
        description: "Customer resolved login difficulty after clearing cookies.",
        priority: "LOW",
        status: "RESOLVED",
      }
    ]
  });
  console.log("Seeded Support Tickets");

  // Seed Portal Announcements
  await prisma.portalAnnouncement.createMany({
    data: [
      {
        title: "Annual Stock Valuation & Audit Schedule",
        content: "Our warehouses will be closed for quarterly stock auditing from August 25th to August 27th. Please schedule dispatches accordingly.",
        category: "ANNOUNCEMENT",
        isActive: true,
      },
      {
        title: "System Update: GST Auto-Calculation Fix",
        content: "The calculation of CGST and SGST for inter-state customer shipping addresses has been fixed in the Sales Invoice screen.",
        category: "UPDATE",
        isActive: true,
      },
      {
        title: "New Supplier Catalog Added: Sanitaryware 2026",
        content: "Geetha Ceramics is proud to introduce 50+ new catalog products under sanitaryware lines. Check details in the Stock directory.",
        category: "GENERAL",
        isActive: true,
      }
    ]
  });
  console.log("Seeded Portal Announcements");

  // Seed HelpDesk Articles (FAQs/Guides)
  await prisma.helpDeskArticle.createMany({
    data: [
      {
        title: "How to Create a New Sales Invoice?",
        content: "To log a sale: 1. Go to Sales. 2. Click Create Invoice. 3. Select Customer and Shipping Address. 4. Select Outlet Series and add stock items. 5. Confirm rate splits and click Post Invoice.",
        category: "SALES",
      },
      {
        title: "Understanding Multi-Warehouse Stock Transfers",
        content: "Transferring stock between warehouses does not write sales revenue. It creates a Stock Transfer transaction to deduct inventory levels at the source location and increment levels at the destination.",
        category: "INVENTORY",
      },
      {
        title: "Accounting & Chart of Accounts Setup",
        content: "We use a double-entry ledger. Standard ledger accounts (Receivables, Payables, CGST/SGST/IGST, Sales Revenue, Purchase Expense) are pre-mapped for automated ledger generation.",
        category: "FINANCE",
      }
    ]
  });
  console.log("Seeded Help Desk Articles");

  // Seed Employees (HR & Payroll)
  await prisma.employee.createMany({
    data: [
      {
        employeeNo: "GC-EMP-001",
        name: "Arun Kumar",
        email: "arun.k@geethaceramics.com",
        phone: "+91 91234 56789",
        department: "FINANCE",
        jobTitle: "Senior Accountant",
        status: "ACTIVE",
        salary: 45000.00,
        joiningDate: new Date("2024-01-15"),
      },
      {
        employeeNo: "GC-EMP-002",
        name: "Priya Rajan",
        email: "priya.r@geethaceramics.com",
        phone: "+91 98123 45670",
        department: "SALES",
        jobTitle: "Sales Manager",
        status: "ACTIVE",
        salary: 38000.00,
        joiningDate: new Date("2024-06-01"),
      },
      {
        employeeNo: "GC-EMP-003",
        name: "Ramesh Selvan",
        email: "ramesh.s@geethaceramics.com",
        phone: "+91 97123 45689",
        department: "WAREHOUSE",
        jobTitle: "Warehouse Supervisor",
        status: "ACTIVE",
        salary: 28000.00,
        joiningDate: new Date("2025-02-10"),
      }
    ]
  });
  console.log("Seeded Employees");

  // Seed Vehicle Movements (Logistics)
  await prisma.vehicleMovement.createMany({
    data: [
      {
        dispatchNo: "DIS-00101",
        invoiceNo: "INV-2026-000001",
        driverName: "Dinesh Murugan",
        vehicleNo: "TN-23-BX-5567",
        sourceWarehouse: whVellore.name,
        destOutlet: outletChennai.name,
        status: "DELIVERED",
        eta: "Completed",
      },
      {
        dispatchNo: "DIS-00102",
        invoiceNo: "INV-2026-000002",
        driverName: "Senthil Nathan",
        vehicleNo: "TN-02-AP-8812",
        sourceWarehouse: whVellore.name,
        destOutlet: outletVellore.name,
        status: "IN_TRANSIT",
        eta: "2 hrs",
      },
      {
        dispatchNo: "DIS-00103",
        invoiceNo: "INV-2026-000003",
        driverName: "Velu Pandian",
        vehicleNo: "TN-23-CY-1102",
        sourceWarehouse: whChennai.name,
        destOutlet: "Mount Road Showroom",
        status: "PENDING",
        eta: "1 day",
      }
    ]
  });
  console.log("Seeded Vehicle Movements");

  console.log("Database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error during database seed execution:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
