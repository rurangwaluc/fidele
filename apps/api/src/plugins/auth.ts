import fp from "fastify-plugin";
import jwt from "@fastify/jwt";

export default fp(async (app) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing");
  }

  await app.register(jwt, {
    secret,
  });
});
