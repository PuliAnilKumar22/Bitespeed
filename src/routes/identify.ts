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

router.post("/", async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;

    const primaryContatctIds = await prisma.contact.findMany({
      distinct: ["primaryId"],
      select: {
        primaryId: true,
      },
      where: {
        OR: [{ email: email }, { phoneNumber: phoneNumber }],
        deletedAt: null,
      },
    });

    if (primaryContatctIds.length === 0) {
      const newContact = await prisma.contact.create({
        data: {
          email,
          phoneNumber,
          linkPrecedence: "primary",
        },
      });

      const updatedContact = await prisma.contact.update({
        where: { id: newContact.id },
        data: {
          primaryId: newContact.id,
        },
      });
    } else if (primaryContatctIds.length === 1) {
      const linkedContact = await prisma.contact.findFirst({
        where: {
          OR: [{ email: email }, { phoneNumber: phoneNumber }],
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const newContact = await prisma.contact.create({
        data: {
          email,
          phoneNumber,
          linkPrecedence: "secondary",
          linkedId: linkedContact.id,
          primaryId: linkedContact.primaryId,
        },
      });
    }

    const updateontact = await prisma.contact.update({
      where: { id: primaryContatctIds[1].primaryId },
      data: {
        linkPrecedence: "secondary",
        linkedId: primaryContatctIds[0].primaryId,
        primaryId: primaryContatctIds[0].primaryId,
      },
    });

    const updateAllontacts = await prisma.contact.updateMany({
      where: { primaryId: primaryContatctIds[1].primaryId },
      data: {
        primaryId: primaryContatctIds[0].primaryId,
      },
    });

    const contacts = await prisma.contact.findMany({
      where: {
        primaryId: primaryContatctIds[0].primaryId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const primaryContact = contacts[0];
    const secondaryContacts = contacts.slice(1);

    return res.json({
      contact: {
        primaryContatctId: primaryContact.id,
        emails: [...new Set(contacts.map((c: Contact) => c.email))],
        phoneNumbers: [...new Set(contacts.map((c: Contact) => c.phoneNumber))],
        secondaryContactIds: [
          ...new Set(secondaryContacts.map((c: Contact) => c.id)),
        ],
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as identifyRouter };
