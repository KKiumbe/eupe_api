const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();




//const { GarbageCollectionDay } = require('./enum.js'); // Adjust the path if needed

const schedule = require('node-schedule'); // For scheduling jobs
const invoiceQueue = require('./jobFunction.js');


// Function to generate a unique invoice number
function generateInvoiceNumber(customerId) {
  const invoiceSuffix = Math.floor(Math.random() * 1000000).toString().padStart(3, '0');
  return `INV${invoiceSuffix}-${customerId}`;
}

// Fetch the customer's current closing balance
async function getCurrentClosingBalance(customerId) {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new Error(`Customer with ID ${customerId} not found.`);
    return customer.closingBalance;
  } catch (error) {
    console.error('Error fetching closing balance:', error);
    throw error;
  }
}

// Get the current month's bill (monthly charge)
async function getCurrentMonthBill(customerId) {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    return customer ? customer.monthlyCharge : 0;
  } catch (error) {
    console.error('Error fetching current month bill:', error);
    throw error;
  }
}







// Generate invoices for active customers using Promise.all
async function generateInvoices() {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth(); // 0-based (0 = Jan, 11 = Dec)
  const currentYear = currentDate.getFullYear();

  try {
    const customers = await prisma.customer.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, closingBalance: true, monthlyCharge: true },
    });
    console.log(`Found ${customers.length} active customers.`);

    if (customers.length === 0) {
      console.log('No active customers found to generate invoices for.');
      return [];
    }

    const invoicePromises = customers.map(async (customer) => {
      try {
        const invoiceNumber = generateInvoiceNumber(customer.id);
        const invoicePeriod = new Date(currentYear, currentMonth, 1); // First day of current month
        const currentClosingBalance = customer.closingBalance;
        const invoiceAmount = customer.monthlyCharge;

        if (invoiceAmount <= 0) {
          console.log(`Skipping invoice for customer ${customer.id}: monthlyCharge is ${invoiceAmount}`);
          return null; // Skip if no charge
        }

        // Calculate new closing balance
        const newClosingBalance = currentClosingBalance + invoiceAmount;

        // Determine invoice status based on closing balance
        let status;
        let amountPaid = 0;
        if (newClosingBalance <= 0 && Math.abs(currentClosingBalance) >= invoiceAmount) {
          // Fully paid via prior overpayment
          status = 'PAID';
          amountPaid = invoiceAmount;
        } else if (newClosingBalance === 0) {
          // Exactly paid (balance was negative, now zero)
          status = 'PAID';
          amountPaid = invoiceAmount;
        } else if (newClosingBalance > 0 && currentClosingBalance < 0) {
          // Partially paid via prior overpayment
          status = 'PPAID';
          amountPaid = Math.abs(currentClosingBalance);
        } else {
          // Unpaid (balance positive or zero with no prior payment)
          status = 'UNPAID';
          amountPaid = 0;
        }

        // Create the new invoice
        const newInvoice = await prisma.invoice.create({
          data: {
            customerId: customer.id,
            invoiceNumber,
            invoicePeriod,
            closingBalance: newClosingBalance,
            invoiceAmount,
            amountPaid,
            status,
            isSystemGenerated: true,
          },
        });

        // Create invoice item
        await prisma.invoiceItem.create({
          data: {
            invoiceId: newInvoice.id,
            description: 'Monthly Charge',
            amount: invoiceAmount,
            quantity: 1,
          },
        });

        // Update customer’s closing balance
        await prisma.customer.update({
          where: { id: customer.id },
          data: { closingBalance: newClosingBalance },
        });

        console.log(`Generated invoice ${invoiceNumber} for customer ${customer.id} with status ${status}`);
        return newInvoice;
      } catch (error) {
        console.error(`Error generating invoice for customer ${customer.id}:`, error);
        return null; // Return null for failed invoices, continue processing others
      }
    });

    const invoices = (await Promise.all(invoicePromises)).filter(invoice => invoice !== null);
    console.log(`Generated ${invoices.length} invoices successfully.`);

    return invoices;
  } catch (error) {
    console.error('Error in generateInvoices:', error);
    throw error; // Re-throw for scheduler or caller to handle
  } finally {
    await prisma.$disconnect();
  }
}






async function generateInvoicesByMonth(requestedMonth) {
  // Use the provided month or default to the current month
  const invoiceMonth = requestedMonth ? parseInt(requestedMonth, 10) : new Date().getMonth() + 1;

  // Ensure the month is valid (1-12)
  if (invoiceMonth < 1 || invoiceMonth > 12) {
    throw new Error('Invalid month. Please provide a value between 1 and 12.');
  }

  try {
    const customers = await prisma.customer.findMany({ where: { status: 'ACTIVE' } });
    console.log(`Found ${customers.length} active customers.`);

    // Process all customers in parallel
    const invoices = await Promise.all(
      customers.map(async (customer) => {
        const invoiceNumber = generateInvoiceNumber(customer.id);
        const invoicePeriod = new Date(new Date().getFullYear(), invoiceMonth - 1, 1);
        const [currentClosingBalance, currentMonthBill] = await Promise.all([
          getCurrentClosingBalance(customer.id),
          getCurrentMonthBill(customer.id, invoiceMonth),
        ]);

        const invoiceAmount = currentMonthBill;
        let status = 'UNPAID';
        const newClosingBalance = currentClosingBalance + invoiceAmount;

        if (newClosingBalance < 0 && Math.abs(currentClosingBalance) >= invoiceAmount) {
          status = 'PAID';
        } else if (newClosingBalance === 0) {
          status = 'PAID';
        } else if (newClosingBalance > 0 && newClosingBalance < invoiceAmount) {
          status = 'PPAID';
        }

        // Create invoice
        const newInvoice = await prisma.invoice.create({
          data: {
            customerId: customer.id,
            invoiceNumber,
            invoicePeriod,
            closingBalance: newClosingBalance,
            invoiceAmount,
            status,
            isSystemGenerated: true,
          },
        });

        // Create invoice item if amount > 0
        if (invoiceAmount > 0) {
          await prisma.invoiceItem.create({
            data: {
              invoiceId: newInvoice.id,
              description: 'Monthly Charge',
              amount: invoiceAmount,
              quantity: 1,
            },
          });
        }

        // Update customer's closing balance
        await prisma.customer.update({
          where: { id: customer.id },
          data: { closingBalance: newClosingBalance },
        });

        return newInvoice;
      })
    );

    console.log(`Generated ${invoices.length} invoices for month ${invoiceMonth}.`);
    return invoices;
  } catch (error) {
    console.error('Error generating invoices:', error);
    throw new Error('Invoice generation failed');
  }
}






schedule.scheduleJob('0 0 1 * *', async () => {
  console.log('Running scheduled job to generate invoices...');
  try {
    await generateInvoices();
  } catch (error) {
    console.error('Error during scheduled job execution:', error);
  }
});






// Controller function to handle invoice generation based on collection day
const generateInvoicesByDay = async (req, res) => {
  const { collectionDay } = req.body;



  try {
    // Call helper function to generate invoices
    const invoices = await generateInvoicesForDay(collectionDay);
    res.status(200).json({ message: "Invoices generated successfully", invoices });
  } catch (error) {
    console.error("Error generating invoices:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Helper function to generate invoices for a specific collection day
const generateInvoicesForDay = async (day) => {
  const currentMonth = new Date().getMonth() + 1;


    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        garbageCollectionDay:day
      }
    });

    const invoices = await Promise.all(
      customers.map(async (customer) => {
        const invoiceNumber = generateInvoiceNumber(customer.id);
        const invoicePeriod = new Date(new Date().getFullYear(), currentMonth - 1, 1);
        const currentClosingBalance = await getCurrentClosingBalance(customer.id);
        const currentMonthBill = await getCurrentMonthBill(customer.id);
        const invoiceAmount = currentMonthBill;

        let status = 'UNPAID';
        const newClosingBalance = currentClosingBalance + invoiceAmount;

        if (newClosingBalance < 0 && Math.abs(currentClosingBalance) >= invoiceAmount) {
          status = 'PAID';
        } else if (newClosingBalance === 0) {
          status = 'PAID';
        } else if (newClosingBalance > 0 && newClosingBalance < invoiceAmount) {
          status = 'PPAID';
        } else {
          status = 'UNPAID';
        }

        const newInvoice = await prisma.invoice.create({
          data: {
            customerId: customer.id,
            invoiceNumber,
            invoicePeriod,
            closingBalance: newClosingBalance,
            invoiceAmount,
            status,
            isSystemGenerated: true,
          },
        });

        if (invoiceAmount > 0) {
          await prisma.invoiceItem.create({
            data: {
              invoiceId: newInvoice.id,
              description: 'Monthly Charge',
              amount: invoiceAmount,
              quantity: 1,
            },
          });
        }

        await prisma.customer.update({
          where: { id: customer.id },
          data: { closingBalance: newClosingBalance },
        });

        return newInvoice;
      })
    );

 
};












// Create a manual invoice for a customer








async function createInvoice(req, res) {
  const { customerId, invoiceItemsData } = req.body;

  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const currentMonth = new Date().getMonth() + 1;
    const invoicePeriod = new Date(new Date().getFullYear(), currentMonth - 1, 1);
    const currentClosingBalance = await getCurrentClosingBalance(customer.id) || 0;

    // Calculate the total invoice amount from invoiceItemsData
    const invoiceAmount = invoiceItemsData.reduce((total, item) => total + item.amount * item.quantity, 0);

    if (!invoiceAmount || invoiceAmount <= 0) {
      return res.status(400).json({ error: 'Invalid invoice amount' });
    }

    const newClosingBalance = currentClosingBalance + invoiceAmount;
    const invoiceNumber = generateInvoiceNumber(customerId);

    // Determine the invoice status based on the new closing balance
    let invoiceStatus;

    if (newClosingBalance < 0 && Math.abs(currentClosingBalance) >= invoiceAmount) {
      // Scenario: PAID - Invoice is fully paid due to overpayment or negative balance
      invoiceStatus = 'PAID';
    } else if (newClosingBalance === 0) {
      // Scenario: PAID - Fully paid, no outstanding balance
      invoiceStatus = 'PAID';
    } else if (newClosingBalance > 0 && newClosingBalance < invoiceAmount) {
      // Scenario: PPAID (Partially Paid) - Customer has partially paid
      invoiceStatus = 'PPAID';
    } else {
      // Scenario: UNPAID - Customer still owes money
      invoiceStatus = 'UNPAID';
    }

    // Create the new invoice
    const newInvoice = await prisma.invoice.create({
      data: {
        customerId,
        invoiceNumber,
        invoicePeriod,
        closingBalance: newClosingBalance,
        invoiceAmount,
        status: invoiceStatus,
        isSystemGenerated: false,
      },
    });

    // Create invoice items
    const invoiceItems = await Promise.all(
      invoiceItemsData.map(itemData =>
        prisma.invoiceItem.create({
          data: {
            invoiceId: newInvoice.id,
            description: itemData.description,
            amount: itemData.amount,
            quantity: itemData.quantity,
          },
        })
      )
    );

    // Update the customer's closing balance after creating the invoice
    await prisma.customer.update({
      where: { id: customerId },
      data: { closingBalance: newClosingBalance },
    });

    res.status(200).json({ newInvoice, invoiceItems });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}


// Cancel an invoice by ID
async function cancelInvoice(invoiceId) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        invoiceAmount: true,
        customerId: true,
        closingBalance: true,
        status: true,
      },
    });

    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status === 'CANCELLED') return invoice;

    const currentClosingBalance = await getCurrentClosingBalance(invoice.customerId);
    const newClosingBalance = currentClosingBalance - invoice.invoiceAmount;

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'CANCELLED',
        closingBalance: newClosingBalance,
      },
    });

    await prisma.customer.update({
      where: { id: invoice.customerId },
      data: { closingBalance: newClosingBalance },
    });

    return updatedInvoice;
  } catch (error) {
    console.error('Error cancelling invoice:', error);
    throw error;
  }
}

// Cancel system-generated invoices atomically
async function cancelSystemGeneratedInvoices() {
  const transaction = await prisma.$transaction(async (prisma) => {
    try {
      // Fetch the latest system-generated invoice
      const latestInvoice = await prisma.invoice.findFirst({
        where: { isSystemGenerated: true },
        orderBy: { createdAt: 'desc' },
      });

      if (!latestInvoice) return null;

      const currentClosingBalance = await getCurrentClosingBalance(latestInvoice.customerId);
      const newClosingBalance = currentClosingBalance - latestInvoice.invoiceAmount;

      // Update the invoice status and closing balance
      const updatedInvoice = await prisma.invoice.update({
        where: { id: latestInvoice.id },
        data: {
          status: 'CANCELLED',
          closingBalance: currentClosingBalance, // Retain the original balance before canceling
        },
      });

      // Update the customer's closing balance
      await prisma.customer.update({
        where: { id: latestInvoice.customerId },
        data: { closingBalance: newClosingBalance },
      });

      return updatedInvoice;
    } catch (error) {
      console.error('Error cancelling system-generated invoice:', error);
      throw new Error('Transaction failed');
    }
  });

  return transaction;
}

// Get all invoices, ordered by the latest first



async function getAllInvoices(req, res) {
  try {
    // Fetch all invoices with customer and item details
    const invoices = await prisma.Invoice.findMany({
      include: {
        customer: true,
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Check if invoices are empty and return a message
    if (invoices.length === 0) {
      return res.status(200).json({ message: 'No invoices found.' });
    }

    // Return the fetched invoices
    res.status(200).json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Error fetching invoices' });
  }
}




// Cancel an invoice by ID (for API)
async function cancelInvoiceById(req, res) {
  const { invoiceId } = req.params;

  try {
    // Retrieve the invoice details including the customer ID and invoice amount
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        invoiceAmount: true,
        customerId: true,
        status: true,
      },
    });

    // Check if the invoice exists and is not already cancelled
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    if (invoice.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Invoice is already cancelled' });
    }

    // Retrieve the customer details to get the current closing balance
    const customer = await prisma.customer.findUnique({
      where: { id: invoice.customerId },
      select: { closingBalance: true },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Calculate the new closing balance for the customer
    const newClosingBalance = customer.closingBalance - invoice.invoiceAmount;

    // Update the invoice status to "CANCELLED"
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'CANCELLED',
      },
    });

    // Update the customer's closing balance
    await prisma.customer.update({
      where: { id: invoice.customerId },
      data: { closingBalance: newClosingBalance },
    });

    // Return a success response
    res.status(200).json({
      message: 'Invoice cancelled successfully',
      invoice: updatedInvoice,
      newClosingBalance,
    });
  } catch (error) {
    console.error('Error cancelling invoice:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}



// Get invoice details by ID
async function getInvoiceDetails(req, res) {
  const { id } = req.params;

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true, customer: true },
    });

    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice details:', error);
    res.status(500).json({ message: 'Error fetching invoice details' });
  }
}

// Exporting all functions
module.exports = {
  createInvoice,
  generateInvoices,
  cancelInvoice,
  cancelSystemGeneratedInvoices,
  getAllInvoices,
  cancelInvoiceById,
  getInvoiceDetails,
  getCurrentClosingBalance,
  getCurrentMonthBill,
  generateInvoicesByDay,generateInvoicesByMonth
};
