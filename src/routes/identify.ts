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
    // Extract email and phoneNumber from request body
    const { email, phoneNumber } = req.body;

    // Step 1: Find all unique primary contact IDs that match the given email or phone
    // This helps us identify if the contact belongs to any existing group of linkage
    const primaryContatctIds = await prisma.contact.findMany({
      distinct: ["primaryId"], // Get unique primary IDs only
      select: {
        primaryId: true,
      },
      where: {
        OR: [{ email: email }, { phoneNumber: phoneNumber }],
        deletedAt: null,
      },
    });

    // Step 2: Handle different scenarios based on the number of primary contacts found
    if (email == null || phoneNumber === null) {
      // If both email and phone are null, return error
      return res
        .status(400)
        .json({ error: "Either email or phoneNumber must be provided" });

    } else if (primaryContatctIds.length === 0) {
      // Case 1: No existing contacts found - Create a new primary contact
      const newContact = await prisma.contact.create({
        data: {
          email,
          phoneNumber,
          linkPrecedence: "primary",
        },
      });

      // Set the primaryId to its own ID since it's the first contact
      const updatedContact = await prisma.contact.update({
        where: { id: newContact.id },
        data: {
          primaryId: newContact.id,
        },
      });

      // Add the new contact's ID to our list of primary IDs
      primaryContatctIds.push({ primaryId: newContact.id });

    } else if (primaryContatctIds.length === 1) {
      // Case 2: One primary contact found - Check if we need to create a secondary contact

      // Find the most recent contact in this group
      const linkedContact = await prisma.contact.findFirst({
        where: {
          OR: [{ email: email }, { phoneNumber: phoneNumber }],
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      // Check if a email with this exact email already exists
      const ifEmailAlreadyExists = await prisma.contact.findFirst({
        where: { email: email },
      });

      // Check if a phone number with this exact phone number already exists
      const ifPhoneNumberAlreadyExists = await prisma.contact.findFirst({
        where:  { phoneNumber: phoneNumber },
      });


      // If no match exists, create a new secondary contact
      if (ifEmailAlreadyExists == null || ifPhoneNumberAlreadyExists == null) {
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
    } else {
      // Case 3: Multiple primary contacts found - Need to merge them

      // Convert the second primary contact to secondary
      const updateontact = await prisma.contact.update({
        where: { id: primaryContatctIds[1].primaryId },
        data: {
          linkPrecedence: "secondary",
          linkedId: primaryContatctIds[0].primaryId,
          primaryId: primaryContatctIds[0].primaryId,
        },
      });

      // Update all contacts that were linked to the second primary contact
      const updateAllontacts = await prisma.contact.updateMany({
        where: { primaryId: primaryContatctIds[1].primaryId },
        data: {
          primaryId: primaryContatctIds[0].primaryId,
        },
      });
    }

    // Step 3: Fetch all contacts in the primary group to prepare response
    const contacts = await prisma.contact.findMany({
      where: {
        primaryId: primaryContatctIds[0].primaryId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Separate primary and secondary contacts
    const primaryContact = contacts[0];
    const secondaryContacts = contacts.slice(1);

    // Step 4: Return consolidated contact information
    return res.json({
      contact: {
        primaryContatctId: primaryContact.id,
        emails: [...new Set(contacts.map((c: Contact) => c.email))], // Get unique emails
        phoneNumbers: [...new Set(contacts.map((c: Contact) => c.phoneNumber))], // Get unique phone numbers
        secondaryContactIds: [
          ...new Set(secondaryContacts.map((c: Contact) => c.id)),
        ], // Get unique secondary contact IDs
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as identifyRouter };
