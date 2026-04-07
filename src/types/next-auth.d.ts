import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    course?: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      course: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    course: string | null;
  }
}
