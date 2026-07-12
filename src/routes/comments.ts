import { Router, Request, Response } from "express";
import { prisma } from "../db/client.js";
import { CommentEntityType } from "@prisma/client";

export const commentsRouter = Router();

function toCommentEntityType(type: string): CommentEntityType {
  return type.toUpperCase() as CommentEntityType;
}

// Get comments for entity
commentsRouter.get("/entity/:entityType/:entityId", async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;
    const { page = 1, limit = 50, includeReplies = "true" } = req.query as { 
      page?: string; limit?: string; includeReplies?: string; 
    };
    
    const comments = await prisma.comment.findMany({
      where: {
        entityType: toCommentEntityType(entityType),
        entityId,
        parentId: null,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true, role: true } },
        page: { select: { id: true, name: true } },
        testRun: { select: { id: true, status: true } },
        replies: includeReplies === "true" ? {
          include: {
            user: { select: { id: true, name: true, avatar: true, role: true } },
          },
          orderBy: { createdAt: "asc" },
        } : false,
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
    
    const total = await prisma.comment.count({
      where: { entityType: toCommentEntityType(entityType), entityId, parentId: null },
    });
    
    res.json({ comments, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get comments for test run
commentsRouter.get("/test-run/:testRunId", async (req: Request, res: Response) => {
  try {
    const { testRunId } = req.params;
    const { page = 1, limit = 50 } = req.query as { page?: string; limit?: string };
    
    const comments = await prisma.comment.findMany({
      where: { testRunId, parentId: null },
      include: {
        user: { select: { id: true, name: true, avatar: true, role: true } },
        replies: {
          include: { user: { select: { id: true, name: true, avatar: true, role: true } } },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
    
    const total = await prisma.comment.count({ where: { testRunId, parentId: null } });
    
    res.json({ comments, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create comment
commentsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { 
      content, 
      entityType, 
      entityId, 
      pageId, 
      testRunId, 
      parentId,
      authorId,
      authorName,
      authorAvatar,
    } = req.body;
    
    if (!content || !entityType || !entityId) {
      res.status(400).json({ error: "content, entityType, entityId are required" });
      return;
    }
    
    // If parentId provided, verify parent exists
    if (parentId) {
      const parent = await prisma.comment.findUnique({ where: { id: parentId } });
      if (!parent) {
        res.status(404).json({ error: "Parent comment not found" });
        return;
      }
    }
    
    const comment = await prisma.comment.create({
      data: {
        content,
        entityType: toCommentEntityType(entityType),
        entityId,
        pageId,
        testRunId,
        parentId,
        authorId,
        authorName,
        authorAvatar,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true, role: true } },
        replies: {
          include: { user: { select: { id: true, name: true, avatar: true, role: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    
    await prisma.auditLog.create({
      data: {
        action: "COMMENT_CREATED",
        entityType: toCommentEntityType(entityType),
        entityId,
        userId: authorId,
        userName: authorName,
        newValue: { commentId: comment.id },
      },
    });
    
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Update comment
commentsRouter.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content, authorId } = req.body;
    
    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }
    
    if (comment.authorId !== authorId) {
      res.status(403).json({ error: "Not authorized to edit this comment" });
      return;
    }
    
    const updated = await prisma.comment.update({
      where: { id },
      data: { content, updatedAt: new Date() },
      include: {
        user: { select: { id: true, name: true, avatar: true, role: true } },
        replies: { include: { user: { select: { id: true, name: true, avatar: true, role: true } } } },
      },
    });
    
    await prisma.auditLog.create({
      data: {
        action: "COMMENT_UPDATED",
        entityType: comment.entityType,
        entityId: comment.entityId,
        userId: authorId,
        userName: comment.authorName,
        oldValue: { content: comment.content },
        newValue: { content },
      },
    });
    
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Delete comment (soft delete)
commentsRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { authorId } = req.query as { authorId?: string };
    
    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }
    
    if (comment.authorId !== authorId) {
      res.status(403).json({ error: "Not authorized to delete this comment" });
      return;
    }
    
    await prisma.comment.update({
      where: { id },
      data: { deletedAt: new Date(), content: "[Deleted]" },
    });
    
    await prisma.auditLog.create({
      data: {
        action: "COMMENT_DELETED",
        entityType: comment.entityType,
        entityId: comment.entityId,
        userId: authorId as string,
        userName: comment.authorName,
        newValue: { commentId: id },
      },
    });
    
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Resolve/unresolve comment
commentsRouter.post("/:id/resolve", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolvedBy, resolve } = req.body;
    
    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }
    
    const updated = await prisma.comment.update({
      where: { id },
      data: {
        resolved: resolve,
        resolvedBy: resolve ? resolvedBy : null,
        resolvedAt: resolve ? new Date() : null,
      },
    });
    
    await prisma.auditLog.create({
      data: {
        action: resolve ? "COMMENT_RESOLVED" : "COMMENT_UNRESOLVED",
        entityType: comment.entityType,
        entityId: comment.entityId,
        userId: resolvedBy,
        userName: comment.authorName,
        newValue: { resolved: resolve },
      },
    });
    
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get comment stats
commentsRouter.get("/stats/summary", async (req: Request, res: Response) => {
  try {
    const { entityType, entityId, startDate, endDate } = req.query as { 
      entityType?: string; entityId?: string; startDate?: string; endDate?: string; 
    };
    
    const where: any = {};
    if (entityType) where.entityType = toCommentEntityType(entityType);
    if (entityId) where.entityId = entityId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }
    
    const [total, resolved, unresolved, withReplies] = await Promise.all([
      prisma.comment.count({ where }),
      prisma.comment.count({ where: { ...where, resolved: true } }),
      prisma.comment.count({ where: { ...where, resolved: false } }),
      prisma.comment.count({ where: { ...where, replies: { some: {} } } }),
    ]);
    
    const byEntityType = await prisma.comment.groupBy({
      by: ["entityType"],
      where,
      _count: { entityType: true },
    });
    
    res.json({ total, resolved, unresolved, withReplies, byEntityType });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});