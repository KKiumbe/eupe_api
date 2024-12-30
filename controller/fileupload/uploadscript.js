const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir); // Save to uploads directory
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`); // Append timestamp to filename
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'text/csv') {
      return cb(new Error('Only CSV files are allowed'));
    }
    cb(null, true);
  },
});

// Helper function to validate and transform customer data
const validateCustomerData = (data) => {
  const requiredFields = [
    'firstName',
    'lastName',
    'phoneNumber',
    'monthlyCharge',
    'garbageCollectionDay',
  ];

  for (const field of requiredFields) {
    if (!data[field]) {
      console.warn(`Missing required field: ${field} for customer ${data.firstName || 'Unknown'}`);
      return null;
    }
  }

  return {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email || null,
    phoneNumber: data.phoneNumber,
    secondaryPhoneNumber: data.secondaryPhoneNumber || null,
    gender: data.gender || null,
    county: data.county || null,
    town: data.town || null,
    location: data.location || null,
    estateName: data.estateName || null,
    building: data.building || null,
    houseNumber: data.houseNumber || null,
    category: data.category || null,
    monthlyCharge: parseFloat(data.monthlyCharge),
    status: 'ACTIVE',
    garbageCollectionDay: data.garbageCollectionDay,
    collected: data.collected ? data.collected.toLowerCase() === 'true' : false,
    closingBalance: parseFloat(data.closingBalance) || 0.0,
  };
};

// Controller function to upload and process customer CSV
const uploadCustomers = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const filePath = path.join(uploadsDir, req.file.filename);
  const customers = [];
  const existingPhoneNumbers = new Set();
  const existingEmails = new Set();

  try {
    const existingCustomers = await prisma.customer.findMany({
      select: {
        phoneNumber: true,
        email: true,
      },
    });

    existingCustomers.forEach((customer) => {
      if (customer.phoneNumber) existingPhoneNumbers.add(customer.phoneNumber);
      if (customer.email) existingEmails.add(customer.email);
    });
  } catch (error) {
    console.error('Error fetching existing customers:', error);
    return res.status(500).json({ message: 'Error checking existing customers' });
  }

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (data) => {
      const customer = validateCustomerData(data);

      if (!customer) return;

      if (existingPhoneNumbers.has(customer.phoneNumber)) {
        console.warn(`Duplicate phone number found: ${customer.phoneNumber}. Skipping entry.`);
        return;
      }
      if (customer.email && existingEmails.has(customer.email)) {
        console.warn(`Duplicate email found: ${customer.email}. Skipping entry.`);
        return;
      }

      customers.push(customer);
      existingPhoneNumbers.add(customer.phoneNumber);
      if (customer.email) existingEmails.add(customer.email);
    })
    .on('end', async () => {
      try {
        if (customers.length > 0) {
          await prisma.customer.createMany({ data: customers });
          res.status(200).json({ message: 'Customers uploaded successfully', customers });
        } else {
          res.status(400).json({ message: 'No valid customers to upload' });
        }
      } catch (error) {
        console.error('Error saving customers:', error);
        res.status(500).json({ message: 'Error saving customers' });
      }
    })
    .on('error', (error) => {
      console.error('Error reading CSV file:', error);
      res.status(500).json({ message: 'Error processing file' });
    });
};

// Controller function to update customers' closing balance
const updateCustomersClosingBalance = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const filePath = path.join(uploadsDir, req.file.filename);
  const updates = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (data) => {
      if (data.phoneNumber && data.closingBalance) {
        updates.push({
          phoneNumber: data.phoneNumber,
          closingBalance: parseFloat(data.closingBalance),
        });
      } else {
        console.warn('Invalid data row, missing phoneNumber or closingBalance:', data);
      }
    })
    .on('end', async () => {
      try {
        const updatePromises = updates.map((update) =>
          prisma.customer.updateMany({
            where: { phoneNumber: update.phoneNumber },
            data: { closingBalance: update.closingBalance },
          })
        );
        await Promise.all(updatePromises);

        res.status(200).json({ message: 'Customers updated successfully', updates });
      } catch (error) {
        console.error('Error updating customers:', error);
        res.status(500).json({ message: 'Error updating customers' });
      }
    })
    .on('error', (error) => {
      console.error('Error reading CSV file:', error);
      res.status(500).json({ message: 'Error processing file' });
    });
};

module.exports = {
  upload,
  uploadCustomers,
  updateCustomersClosingBalance,
};
