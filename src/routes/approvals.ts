import { Router, Request, Response } from "express";
import { prisma } from "../db/client.js";
import { ApprovalEntityType, ApprovalStatus } from "@prisma/client";

export const approvalsRouter = Router();

function toEntityType(type: string): ApprovalEntityType {
  return type.toUpperCase() as ApprovalEntityType;
}

function toStatus(s: string): ApprovalStatus {
  return s.toUpperCase() as ApprovalStatus;
}

// Get approvals for an entity
approvalsRouter.get("/:entityType/:entityId", async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;
    const { status } = req.query as { status?: string };
    
    const where: any = {
      entityType: toEntityType(entityType),
      entityId,
    };
    
    if (status) {
      where.status = toStatus(status);
    }
    
    const approvals = await prisma.approval.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
        page: { select: { id: true, name: true, url: true } },
        testRun: { select: { id: true, status: true, diffPercent: true, completedAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    
    res.json(approvals);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Request approval
approvalsRouter.post("/:entityType/:entityId", async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;
    const { 
      pageId, 
      testRunId, 
      requestedBy, 
      requestedByName, 
      expiresAt, 
      reason,
      userId 
    } = req.body;
    
    // Check if pending approval already exists
    const existing = await prisma.approval.findFirst({
      where: {
        entityType: toEntityType(entityType),
        entityId,
        status: "PENDING",
      },
    });
    
    if (existing) {
      res.status(409).json({ 
        error: "Pending approval already exists", 
        approval: existing 
      });
      return;
    }
    
    const approval = await prisma.approval.create({
      data: {
        entityType: toEntityType(entityType),
        entityId,
        pageId,
        testRunId,
        status: "PENDING",
        requestedBy,
        requestedByName,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        reason,
        userId,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        page: { select: { id: true, name: true, url: true } },
        testRun: { select: { id: true, status: true, diffPercent: true } },
      },
    });
    
    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: "APPROVAL_REQUESTED",
        entityType: entityType.toUpperCase(),
        entityId,
        userId: requestedBy,
        userName: requestedByName,
        newValue: { approvalId: approval.id },
      },
    });
    
    res.status(201).json(approval);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Approve
approvalsRouter.post("/:id/approve", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approvedBy, approvedByName, userId } = req.body;
    
    const approval = await prisma.approval.findUnique({ where: { id } });
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    
    if (approval.status !== "PENDING") {
      res.status(400).json({ error: `Approval is ${approval.status}, cannot approve` });
      return;
    }
    
    if (approval.expiresAt && new Date() > approval.expiresAt) {
      res.status(400).json({ error: "Approval has expired" });
      return;
    }
    
    const updated = await prisma.approval.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedBy,
        approvedByName,
        approvedAt: new Date(),
        userId,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        page: { select: { id: true, name: true } },
        testRun: { select: { id: true, status: true } },
      },
    });
    
    // If it's a test run approval, update test run status
    if (approval.testRunId) {
      await prisma.testRun.update({
        where: { id: approval.testRunId },
        data: { status: "AI_ACCEPTED" },
      });
    }
    
    await prisma.auditLog.create({
      data: {
        action: "APPROVAL_APPROVED",
        entityType: approval.entityType,
        entityId: approval.entityId,
        userId: approvedBy,
        userName: approvedByName,
        oldValue: { status: approval.status },
        newValue: { status: "APPROVED" },
      },
    });
    
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Reject
approvalsRouter.post("/:id/reject", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rejectedBy, rejectedByName, reason, userId } = req.body;
    
    const approval = await prisma.approval.findUnique({ where: { id } });
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    
    if (approval.status !== "PENDING") {
      res.status(400).json({ error: `Approval is ${approval.status}, cannot reject` });
      return;
    }
    
    const updated = await prisma.approval.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectedBy,
        rejectedByName,
        rejectedAt: new Date(),
        reason,
        userId,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        page: { select: { id: true, name: true } },
        testRun: { select: { id: true, status: true } },
      },
    });
    
    if (approval.testRunId) {
      await prisma.testRun.update({
        where: { id: approval.testRunId },
        data: { status: "AI_REJECTED" },
      });
    }
    
    await prisma.auditLog.create({
      data: {
        action: "APPROVAL_REJECTED",
        entityType: approval.entityType,
        entityId: approval.entityId,
        userId: rejectedBy,
        userName: rejectedByName,
        oldValue: { status: approval.status },
        newValue: { status: "REJECTED", reason },
      },
    });
    
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Cancel approval
approvalsRouter.post("/:id/cancel", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, userName } = req.body;
    
    const approval = await prisma.approval.findUnique({ where: { id } });
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    
    if (approval.status !== "PENDING") {
      res.status(400).json({ error: `Approval is ${approval.status}, cannot cancel` });
      return;
    }
    
    const updated = await prisma.approval.update({
      where: { id },
      data: {
        status: "CANCELLED",
        userId,
      },
    });
    
    await prisma.auditLog.create({
      data: {
        action: "APPROVAL_CANCELLED",
        entityType: approval.entityType,
        entityId: approval.entityId,
        userId,
        userName,
        oldValue: { status: approval.status },
        newValue: { status: "CANCELLED" },
      },
    });
    
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get approval stats
approvalsRouter.get("/stats/summary", async (_req: Request, res: Response) => {
  try {
    const [pending, approved, rejected, expired] = await Promise.all([
      prisma.approval.count({ where: { status: "PENDING" } }),
      prisma.approval.count({ where: { status: "APPROVED" } }),
      prisma.approval.count({ where: { status: "REJECTED" } }),
      prisma.approval.count({ where: { status: "EXPIRED" } }),
    ]);
    
    const byEntity = await prisma.approval.groupBy({
      by: ["entityType"],
      _count: { status: true },
    });
    
    res.json({ pending, approved, rejected, expired, byEntity });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});