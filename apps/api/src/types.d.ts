import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      userId: string;
      sessionId: string;
      tokenId: string;
    };
    user: {
      userId: string;
      sessionId: string;
      tokenId: string;
    };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      role: "owner" | "employee";
      permissions: string[];
    };
  }
}
