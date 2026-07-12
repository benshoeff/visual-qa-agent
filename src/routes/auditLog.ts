import { Router, Request, Response } from "express";
import { prisma } from "../db/client.js";

export const auditLogRouter = Router();

// Get audit logs with filters
auditLogRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { 
      entityType, 
      entityId, 
      userId, 
      action, 
      page = 1, 
      limit = 50,
      startDate,
      endDate,
    } = req.query as { 
      entityType?: string; entityId?: string; userId?: string; action?: string; 
      page?: string; limit?: string; startDate?: string; endDate?: string; 
    };
    
    const where: any = {};
    
    if (entityType) where.entityType = entityType.toUpperCase();
    if (entityId) where.entityId = entityId;
    if (userId) where.userId = userId;
    if (action) where.action = action.toUpperCase();
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }
    
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
    
    const total = await prisma.auditLog.count({ where });
    
    res.json({ logs, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get audit log for specific entity
auditLogRouter.get("/entity/:entityType/:entityId", async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    const logs = await prisma.auditLog.findMany({
      where: {
        entityType: entityType.toUpperCase(),
        entityId,
      },
      orderBy: { createdAt: "desc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
    
    const total = await prisma.auditLog.count({
      where: { entityType: entityType.toUpperCase(), entityId },
    });
    
    res.json({ logs, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get audit log by ID
auditLogRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const log = await prisma.auditLog.findUnique({ where: { id: req.params.id } });
    if (!log) {
      res.status(404).json({ error: "Audit log not found" });
      return;
    }
    res.json(log);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get action statistics
auditLogRouter.get("/stats/actions", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }
    
    const stats = await prisma.auditLog.groupBy({
      by: ["action"],
      where,
      _count: { action: true },
      orderBy: { _count: { action: "desc" } },
    });
    
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get user activity
auditLogRouter.get("/stats/users", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, limit = 20 } = req.query;
    
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }
    
    const stats = await prisma.auditLog.groupBy({
      by: ["userId", "userName"],
      where,
      _count: { userId: true },
      orderBy: { _count: { userId: "desc" } },
      take: Number(limit),
    });
    
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get timeline for entity
auditLogRouter.get("/timeline/:entityType/:entityId", async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;
    const { limit = 100 } = req.query;
    
    const logs = await prisma.auditLog.findMany({
      where: {
        entityType: entityType.toUpperCase(),
        entityId,
      },
      orderBy: { createdAt: "asc" },
      take: Number(limit),
    });
    
    // Group by date
    const timeline = logs.reduce((acc, log) => {
      const date = log.createdAt.toISOString().split("T")[0];
      if (!acc[date]) acc[date] = [];
      acc[date].push(log);
      return acc;
    }, {} as Record<string, typeof logs>);
    
    res.json({ timeline, total: logs.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});