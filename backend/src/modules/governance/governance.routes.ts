import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requirePermission } from "../../middleware/authentication.js";
import { pageSchema } from "../issues/issues.schemas.js";
import { governanceService } from "./governance.service.js";
const idSchema = z.object({ id: z.uuid() }).strict(),
  empty = z.object({}).strict(),
  reason = z.string().trim().min(10).max(1000);
export function governanceRoutes(db: PrismaClient) {
  const router = Router(),
    service = governanceService(db);
  router.get(
    "/catalog",
    requirePermission("tenants:read"),
    async (req, res) => {
      empty.parse(req.query);
      res.json({ data: await service.catalog() });
    },
  );
  router.get(
    "/roles",
    requirePermission("governance:read"),
    async (req, res) => {
      empty.parse(req.query);
      res.json({ data: await service.roles() });
    },
  );
  router.get(
    "/policies",
    requirePermission("governance:read"),
    async (req, res) => {
      empty.parse(req.query);
      res.json({ data: await service.policies() });
    },
  );
  router.get(
    "/users",
    requirePermission("governance:manage"),
    async (req, res) => {
      empty.parse(req.query);
      res.json({ data: await service.users() });
    },
  );
  router.patch(
    "/policies/:id",
    requirePermission("governance:manage"),
    async (req, res) => {
      const { id } = idSchema.parse(req.params);
      empty.parse(req.query);
      const data = z
        .object({
          description: z.string().trim().min(20).max(3000),
          expectedDescription: z.string().max(3000),
          reason,
        })
        .strict()
        .parse(req.body);
      res.json({
        data: await service.updatePolicy(res.locals.actor, id, data),
      });
    },
  );
  router.get("/audit", requirePermission("audit:read"), async (req, res) => {
    const q = pageSchema
      .extend({
        action: z.string().trim().max(80).optional(),
        entity: z.string().trim().max(80).optional(),
      })
      .parse(req.query);
    res.json({ data: await service.audit(res.locals.actor, q) });
  });
  router.patch(
    "/users/:id/role",
    requirePermission("governance:manage"),
    async (req, res) => {
      const { id } = idSchema.parse(req.params);
      empty.parse(req.query);
      const data = z
        .object({ roleId: z.uuid(), expectedRoleId: z.uuid(), reason })
        .strict()
        .parse(req.body);
      res.json({ data: await service.updateRole(res.locals.actor, id, data) });
    },
  );
  return router;
}
