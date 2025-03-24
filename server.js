const express = require('express');

const cors = require('cors');
const helmet = require('helmet'); // Import Helmet
require('dotenv').config();
const bodyParser = require('body-parser');
const customerRoutes = require('./routes/customer/customerRoutes.js');
const userRoutes = require('./routes/userRoute/userRoute.js');
const invoiceRoutes = require('./routes/invoices/invoiceRoute.js');
const mpesaRoute = require('./routes/mpesa/mpesaRoute.js');
const collectionRoute = require('./routes/collection/collectionRoute.js');
const sendSmsRoute = require('./routes/sms/sendSmsRoute.js');
const receiptRoute = require('./routes/receipt/receiptingRoute.js');
const paymentRoute = require('./routes/payment/paymentRoutes.js');
const statsRoute = require('./routes/stats/statsRoute.js');
const statsms = require('./routes/sms/statsmsRoute.js');
const uploadcustomers = require('./routes/fileUpload/uploadRoute.js');
const customerdetailsRoute = require('./routes/customer/customerDetailsRoute.js')
const smsBalanceRoute = require('./routes/sms/balance.js')
const reportsReoute  = require('./routes/reportRoutes/reportRoute.js')
const userManagementRoute = require('./routes/rolesRoute/roles.js')
const cookieParser = require('cookie-parser');

const permissionsRoutes = require('./routes/permision/permissionRoute.js')
const createTask = require('./routes/task/taskRoute.js')
const mailerRoute = require('./routes/mailer/mailRoute.js');
const { scheduleInvoices } = require('./controller/bill/jobFunction.js');

const app = express();
const PORT = process.env.SERVER_PORT;

console.log(`this is the port ${PORT}`);

app.use(cookieParser());
//app.use(verifyToken);
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

app.use(helmet());
app.use(cors({
    origin: '*', 
    credentials: true,
}));


// Use customer routes
app.use('/eupe', customerRoutes);
app.use('/eupe', userRoutes);
app.use('/eupe', sendSmsRoute);
app.use('/eupe', invoiceRoutes);
app.use('/eupe', mpesaRoute);
app.use('/eupe', collectionRoute);
app.use('/eupe', receiptRoute);
app.use('/eupe', paymentRoute);
app.use('/eupe', statsRoute);
app.use('/eupe', statsms);
app.use('/eupe', uploadcustomers); 
app.use('/eupe', customerdetailsRoute); 
app.use('/eupe', smsBalanceRoute); 
app.use('/eupe', reportsReoute); 
app.use('/eupe', userManagementRoute); 
app.use('/eupe', permissionsRoutes);
app.use('/eupe', createTask);
app.use('/eupe', mailerRoute);


// Start the HTTP server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port : ${PORT}`);

  scheduleInvoices()
});


const timeoutDuration = 90000; // Set timeout duration in milliseconds (e.g., 60000 ms = 60 seconds)
server.setTimeout(timeoutDuration, () => {
  console.log(`Server timed out after ${timeoutDuration / 9000} seconds.`);
});



