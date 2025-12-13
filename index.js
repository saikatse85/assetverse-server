require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const admin = require('firebase-admin')
const port = process.env.PORT || 3000

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8');
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});


const app = express()
// middleware
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://assignment-11-839b6.web.app'
    ],
    credentials: true,
    optionSuccessStatus: 200,
  })
)
app.use(express.json())

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(' ')[1]
  if (!token) return res.status(401).send({ message: 'Unauthorized Access!' })
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.tokenEmail = decoded.email
    
    next()
  } catch (err) {
    console.log(err)
    return res.status(401).send({ message: 'Unauthorized Access!', err })
  }
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rwnfgfy.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db=client.db('assetverseDB');
    const usersCollection= db.collection('users')
    const assetsCollection= db.collection('assets')
    const requestsCollection = db.collection("requests");
    const packagesCollection = db.collection("packages");
    const paymentsCollection = db.collection("payments");
    const employeeAffiliationsCollection = db.collection("employeeAffiliations");
    const assignedAssetsCollection = db.collection("assignedAssets");
    

//employees Collections
// GET user by email
app.get("/users/email/:email",  async (req, res) => {
  
  try {
    const email = req.params.email;
    const user = await usersCollection.findOne({ email: email });
    if (!user) return res.status(404).send({ message: "User not found" });
    res.send(user);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

// POST new user
app.post('/users',verifyJWT, async (req, res) => {
  try {
    const user = req.body;
    
    //if already exists
    const exist = await usersCollection.findOne({ email: user.email });

    if (exist) return res.status(400).json({ message: "User already exists" });
    user.createdAt = new Date();  
    user.updatedAt = null;        

    const result = await usersCollection.insertOne(user);

    res.status(201).json({
      message: "User registered successfully",
      userId: result.insertedId
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});
// update Users
app.patch("/users/:email",verifyJWT, async (req, res) => {
  try {
    const usersCollection = client.db("assetverseDB").collection("users");
    const email = req.params.email;
    const updateData = req.body;

    updateData.updatedAt = new Date(); 

    const result = await usersCollection.updateOne(
      { email },
      { $set: updateData }
    );

    res.json({ message: "User Updated Successfully", result });

  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// GET all assets
app.get("/assets", verifyJWT, async (req, res) => {
  try {
    // Get page & limit from query params (default: page=1, limit=10)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    // Total count for pagination
    const total = await assetsCollection.countDocuments();

    // Fetch page-wise assets
    const assets = await assetsCollection
      .find()
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      assets,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch assets", error: err.message });
  }
});



// add asset post
app.post('/assets',verifyJWT, async (req, res) => {
  try {
    const asset = req.body;

    
    const requiredFields = [
      "productName",
      "productImage",
      "productType",
      "productQuantity",
      "hrEmail",
      "companyName",
    ];

    for (const field of requiredFields) {
      if (!asset[field]) {
        return res.status(400).json({ message: `${field} is required` });
      }
    }

    
    if (!asset.availableQuantity) {
      asset.availableQuantity = parseInt(asset.productQuantity);
    }

    asset.dateAdded = new Date();

    const result = await assetsCollection.insertOne(asset);

    res.status(201).json({
      success: true,
      message: "Asset added successfully",
      insertedId: result.insertedId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

// Update asset
app.patch("/assets/:id", verifyJWT, async (req, res) => {
  try {
    const assetId = req.params.id;
    const updateData = req.body;

    const result = await assetsCollection.updateOne(
      { _id: new ObjectId(assetId) },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: "Asset not found or no changes applied" });
    }

    res.status(200).json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update asset", error: err.message });
  }
});
// asset delete
app.delete('/assets/:id', verifyJWT, async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };

    const result = await assetsCollection.deleteOne(query);

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "Asset not found" });
    }
    return res.status(200).json({ success: true, message: "Asset deleted successfully" });

  } catch (err) {
    console.error("Error deleting asset:", err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete asset",
        error: err.message,
      });
  }
});

  // GET available packages 
    app.get("/packages", async (req, res) => {
      const packages = await packagesCollection.find().toArray();
      res.json(packages);
    });

// payment section api
app.post("/create-payment-session", async (req, res) => {
  const { email, packageName, price, employeeLimit } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: packageName },
            unit_amount: price * 100,
          },
          quantity: 1,
        },
      ],

      
      metadata: {
        packageName,
        employeeLimit: employeeLimit,
      },

      success_url: `${process.env.CLIENT_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_DOMAIN}/dashboard/payment-cancel`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Stripe session error", error });
  }
});

app.get("/verify-payment", async (req, res) => {
  try {
    const session_id = req.query.session_id;
    const session = await stripe.checkout.sessions.retrieve(session_id);
    // Already saved or not payment checking 
    const existing = await paymentsCollection.findOne({
      transactionId: session.payment_intent,
    });

    if (existing) {
      return res.send({
        success: true,
        payment: existing,
        message: "Payment already recorded!",
      });
    }

    const payment = {
      hrEmail: session.customer_email,
      packageName: session.metadata.packageName,
      employeeLimit: Number(session.metadata.employeeLimit),
      amount: session.amount_total,
      transactionId: session.payment_intent,
      paymentDate: new Date(),
      status: session.payment_status,
    };

    await paymentsCollection.insertOne(payment);

    res.send({ success: true, payment });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
});
// Request Collection Create
app.post("/requests", async (req, res) => {
  try {
    const request = req.body;

    const requiredFields = [
      "assetId",
      "assetName",
      "assetType",
      "requesterEmail",
      "requesterName",
      "hrEmail",
      "companyName",
      "assetImage",
      "employeeImage"
    ];

    // Validation
    for (const field of requiredFields) {
      if (!request[field]) {
        return res.status(400).send({ message: `${field} is required` });
      }
    }

    //image fetch
    const asset = await assetsCollection.findOne(
      { _id: new ObjectId(request.assetId) },
      { projection: { productImage: 1 } } 
    );

    request.assetImage = request?.assetImage || asset?.productImage || "";

    request.requestStatus = "pending";
    request.requestDate = new Date();

    const result = await requestsCollection.insertOne(request);

    res.status(201).send({
      success: true,
      message: "Request created successfully",
      requestId: result.insertedId
    });

  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to create request", error: err.message });
  }
});

// GET fetch all asset requests
app.get("/requests",verifyJWT, async (req, res) => {
  try {
    const requests = await requestsCollection.find().sort({ requestDate: -1 }).toArray();
    res.send(requests);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch requests", error: err.message });
  }
});

app.patch("/requests/approve/:id",verifyJWT, async (req, res) => {
  const { id } = req.params;
  try {
    // Find the request first
    const request = await requestsCollection.findOne({ _id: new ObjectId(id) });
    if (!request) return res.status(404).send({ message: "Request not found" });

    // Update request status
    await requestsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { requestStatus: "approved", approvedAt: new Date() } }
    );

    // Add employee to employeeAffiliations collection
    const affiliationData = {
      employeeEmail: request.requesterEmail,
      employeeName: request.requesterName,
      employeeImage: request.employeeImage, 
      hrEmail: request.hrEmail,
      role: request.role || "employee",
      companyName: request.companyName,
      status: "active",
      joinedAt: new Date(),
    };

    // Prevent duplicates
    const exist = await employeeAffiliationsCollection.findOne({
      employeeEmail: request.requesterEmail,
      hrEmail: request.hrEmail,
    });

    if (!exist) {
      await employeeAffiliationsCollection.insertOne(affiliationData);
    }

    res.send({
      success: true,
      message: "Request approved and employee added to team",
      affiliationData,
    });

  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to approve request", error: err.message });
  }
});

// REQUEST REJECT ROUTE
app.patch("/requests/reject/:id",verifyJWT, async (req, res) => {
    const id = req.params.id;

    const result = await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { requestStatus: "rejected", rejectedDate: new Date() } }
    );

    res.send({ message: "Request Rejected", result });
});


app.get("/hr/employees/:email", verifyJWT, async (req, res) => {
  try {
    const email = req.params.email;

    const user = await usersCollection.findOne({ email });

    let affiliations = [];

    if (user.role === "hr") {
      // HR → all employees under him
      affiliations = await employeeAffiliationsCollection.find({
        hrEmail: email,
        status: "active",
      }).toArray();
    } else {
      // Employee → team per company
      const myCompanies = await employeeAffiliationsCollection.find({
        employeeEmail: email,
        status: "active",
      }).toArray();

      const companyNames = myCompanies.map(c => c.companyName);

      affiliations = await employeeAffiliationsCollection.find({
        companyName: { $in: companyNames },
        status: "active",
      }).toArray();
    }

    const employeesData = await Promise.all(
      affiliations.map(async (emp) => {
        const userData = await usersCollection.findOne({ email: emp.employeeEmail });

        const assetsCount = await assignedAssetsCollection.countDocuments({
          employeeEmail: emp.employeeEmail,
        });

        return {
          _id: emp._id,
          employeeName: emp.employeeName || userData?.name,
          employeeEmail: emp.employeeEmail,
          employeeImage: emp.employeeImage || userData?.photoURL || "",
          position: emp.position || userData?.position || "Employee",
          dateOfBirth: emp.dateOfBirth || userData?.dateOfBirth || null,
          joinDate: emp.createdAt || userData?.createdAt || null,
          companyName: emp.companyName,
          assetsCount,
        };
      })
    );

    res.send(employeesData);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
});

// PATCH /hr/remove-employee/:id
app.patch("/hr/remove-employee/:employeeId",verifyJWT, async (req, res) => {
  try {
    const employeeId = req.params.employeeId;

    // Remove employee from employeesCollection
    const result = await employeeAffiliationsCollection.deleteOne({ _id: new ObjectId(employeeId) });

    if (result.deletedCount > 0) {
      res.status(200).send({ message: "Employee removed successfully" });
    } else {
      res.status(404).send({ message: "Employee not found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to remove employee", error: err.message });
  }
});

// My Assets API for Employee
app.get("/assigned-assets/:email",verifyJWT, async (req, res) => {
  try {
    const email = req.params.email;
    const assets = await assignedAssetsCollection.find({ employeeEmail: email }).toArray();
    res.send(assets);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch assigned assets" });
  }
});

// Assigned Asset APi
app.post("/assigned-assets",verifyJWT, async (req, res) => {
  try {
    const {
      assetId,
      assetName,
      assetType,
      employeeEmail,
      employeeName,
      profileImage,
      employeeImage,
      companyName,
      assetImage,
      requestId,
      requestDate,
      approvalDate,
      hrEmail,
      role,
    } = req.body;

    if (!assetId || !assetName || !employeeEmail || !companyName || !hrEmail) {
      return res.status(400).send({ success: false, message: "Missing required fields" });
    }

    //Insert into assignedAssetsCollection
    const assignedAsset = {
      assetId,
      assetName,
      assetType,
      assetImage: assetImage || "",
      employeeEmail,
      profileImage,
      employeeImage,
      employeeName,
      companyName,
      assignmentDate: new Date(),
      requestId,
      status: "assigned",
      requestDate,
      approvalDate,
      role,
    };

    await assignedAssetsCollection.insertOne(assignedAsset);

    //Update request status in requests collection
    await requestsCollection.updateOne(
      { _id: new ObjectId(requestId) },
      { $set: { requestStatus: "approved", approvalDate: new Date(), processedBy: hrEmail } }
    );

    // Check employee is already affiliated with this company
    const existingAffiliation = await employeeAffiliationsCollection.findOne({
      employeeEmail,
      hrEmail,
      role,
      companyName,
      status: "active",
    });

    if (!existingAffiliation) {
      // If not affiliated, create a new record
      await employeeAffiliationsCollection.insertOne({
        employeeEmail,
        employeeName,
        profileImage,
        employeeImage,
        hrEmail,
        role,
        companyName,
        companyLogo: "", 
        affiliationDate: new Date(),
        status: "active",
      });
    }

    res.send({ success: true, message: "Asset assigned and affiliation updated" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, message: "Server error", error: err.message });
  }
});

app.patch("/assigned-assets/return/:id",verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    // Update asset status
    const result = await assignedAssetsCollection.updateOne(
      { _id: new ObjectId(id), status: "assigned", assetType: "Returnable" },
      { $set: { status: "returned", returnDate: new Date() } }
    );

    if (result.modifiedCount === 0) {
      return res
        .status(400)
        .send({ message: "Asset not found or not returnable" });
    }

    res.send({ message: "Asset returned successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to return asset" });
  }
});
// Insert Payment API
app.post("/payments/add", verifyJWT, async (req, res) => {
  try {
    const { hrEmail, packageName, employeeLimit, amount, transactionId, status } = req.body;

    // Validate required fields
    if (!hrEmail || !packageName || !employeeLimit || !amount || !transactionId || !status) {
      return res.status(400).send({ success: false, message: "Missing required fields" });
    }

    const paymentDoc = {
      hrEmail,
      packageName,
      employeeLimit,
      amount,
      transactionId,
      paymentDate: new Date(),
      status,
    };

    await paymentsCollection.insertOne(paymentDoc);

    res.send({ success: true, message: "Payment recorded successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, message: "Failed to record payment", error: err.message });
  }
});
app.get("/payments/:hrEmail",verifyJWT, async (req, res) => {
  try {
    const hrEmail = req.params.hrEmail;
    const payments = await paymentsCollection.find({ hrEmail }).sort({ paymentDate: -1 }).toArray();
    res.send(payments);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch payments" });
  }
});

// Profile get related API
app.get("/profile/:email", verifyJWT, async (req, res) => {
  try {
    const email = req.params.email;
    const user = await usersCollection.findOne({ email });

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    res.status(200).send(user);
  } catch (err) {
    res.status(500).send({ message: "Failed to fetch profile", error: err.message });
  }
});
//Profile Update Route
app.put("/profile/update/:email", verifyJWT, async (req, res) => {
  try {
    const email = req.params.email;
    const updatedData = req.body;

    // email protect: user cannot update email
    if (updatedData.email) delete updatedData.email;

    const result = await usersCollection.updateOne(
      { email },
      { $set: updatedData }
    );

    if (result.modifiedCount > 0) {
      return res.send({ success: true, message: "Profile updated successfully!" });
    }

    res.send({ success: false, message: "No changes applied" });

  } catch (err) {
    res.status(500).send({ message: "Failed to update profile", error: err.message });
  }
});
//Hr analytics api 
app.get("/analytics/asset-types", verifyJWT, async (req, res) => {
  const assets = await assetsCollection.find().toArray();

  const returnable = assets.filter(
    a => a.productType === "Returnable"
  ).length;

  const nonReturnable = assets.filter(
    a => a.productType === "Non-returnable"
  ).length;

  res.send([
    { type: "Returnable", count: returnable },
    { type: "Non-returnable", count: nonReturnable },
  ]);
});

app.get("/analytics/top-assets", verifyJWT, async (req, res) => {
  const requests = await requestsCollection.find().toArray();

  const map = {};
  requests.forEach(req => {
    map[req.assetName] = (map[req.assetName] || 0) + 1;
  });

  const result = Object.entries(map)
    .map(([name, requests]) => ({ name, requests }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 5);

  res.send(result);
});






    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 })
    // console.log(
    //   'Pinged your deployment. You successfully connected to MongoDB!'
    // )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from Server..')
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
