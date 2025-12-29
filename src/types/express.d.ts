import "@types/express-serve-static-core";

declare global {
  namespace Express {
    interface User {
      id: string;
      businessId: string | null; // ✅ allow null
      role: string;
    }

    interface Menu {
      id: string;
      vendorId: string;
      menuTypeId: string;
      name: string;
      description: string | null;
      currency: string;
      isActive: boolean;
      visibility: string;
    }

    interface Request {
      user?: User;
      menu?: Menu;
    }
  }
}

export {};
