import { Router } from "express";
import { z } from "zod";
import { PrismaClient, Contact } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

// GET endpoint to retrieve all contacts
router.get("/", async (req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return res.json({
      contacts: contacts.map((contact: Contact) => ({
        id: contact.id,
        email: contact.email,
        phoneNumber: contact.phoneNumber,
        linkedId: contact.linkedId,
        primaryId: contact.primaryId,
        linkPrecedence: contact.linkPrecedence,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching contacts:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE endpoint to delete all contacts
router.delete("/", async (req, res) => {
  try {
    // Soft delete all contacts
    await prisma.contact.updateMany({
      where: { deletedAt: null },
      data: { deletedAt: new Date() },
    });

    return res.json({ message: "All contacts deleted successfully" });
  } catch (error) {
    console.error("Error deleting all contacts:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as identifyRouter };
