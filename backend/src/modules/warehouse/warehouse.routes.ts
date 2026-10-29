import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requirePermission } from "../../middleware/authentication.js";
import { pageSchema } from "../issues/issues.schemas.js";
import { tenantList, tenantDetail, unitList } from "./warehouse.service.js";
const listSchema = pageSchema.extend({
  q: z.string().trim().max(100).optional(),
});
export function warehouseRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission("tenants:read"));
  router.get("/tenants", async (req, res) =>
    res.json({
      data: await tenantList(db, res.locals.actor, listSchema.parse(req.query)),
    }),
  );
  router.get("/units", async (req, res) =>
    res.json({
      data: await unitList(db, res.locals.actor, listSchema.parse(req.query)),
    }),
  );
  router.get("/tenants/:id", async (req, res) => {
    const { id } = z.object({ id: z.uuid() }).strict().parse(req.params);
    z.object({}).strict().parse(req.query);
    res.json({ data: await tenantDetail(db, res.locals.actor, id) });
  });
  return router;
}
