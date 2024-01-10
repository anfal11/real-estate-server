const express = require("express");
const app = express();
const SSLCommerzPayment = require("sslcommerz-lts");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;

//middleware
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

//mongodb connection

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ey8cr7h.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASS;
const is_live = false; //true for live, false for sandbox

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db("realEstateDB").collection("users");
    const propertyCollection = client
      .db("realEstateDB")
      .collection("properties");
    const reviewCollection = client.db("realEstateDB").collection("review");
    const wishlistCollection = client.db("realEstateDB").collection("wishlist");
    const offerCollection = client.db("realEstateDB").collection("offers");
    const paymentCollection = client.db("realEstateDB").collection("payment");

    //jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "3h",
      });
      res.send({ token: token });
    });

    // Middleware to verify JWT token
    const verifyToken = (req, res, next) => {
      try {
        const authorizationHeader = req.headers.authorization;
        if (!authorizationHeader || typeof authorizationHeader !== "string") {
          console.log("56: Token being verified:", authorizationHeader);
          return res.status(401).send({ message: "Unauthorized request" });
        }
        const token = authorizationHeader.split(" ")[1];
        console.log("Received token:", token);
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        req.user = decoded;
        next();
      } catch (error) {
        console.error(error);
        return res.status(401).send({ message: "Unauthorized request" });
      }
    };

    // Middleware to verify admin access
    const verifyAdmin = async (req, res, next) => {
      try {
        if (!req.user || !req.user.email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }
        const email = req.user.email;
        const user = await userCollection.findOne({ email });

        if (!user) {
          return res.status(403).send({ message: "Forbidden Access" });
        }
        if (user.role !== "admin") {
          return res.status(403).send({ message: "Forbidden Access" });
        }
        next();
      } catch (error) {
        console.error(error);
        return res.status(500).send({ message: "Internal server error" });
      }
    };

    const tran_id = new ObjectId().toString();
    //payment
    app.get("/payment", async (req, res) => {
      const payment = await paymentCollection.find().toArray();
      res.send(payment);
    });

    app.post("/payment", async (req, res) => {
      // Assuming req.body contains the necessary information, including the property price
      const property = await propertyCollection.findOne({
        _id: new ObjectId(req.body.id),
      });

      console.log("Property:", property);
      if (!property) {
        console.log("Property not found for ID:", req.body.id);
        return res.status(404).send("Property not found");
      }

      const pay = req.body;

      const data = {
        total_amount: property.price || 0, // Set total_amount dynamically based on property price
        currency: "BDT",
        tran_id: tran_id, // use unique tran_id for each api call
        success_url: `http://localhost:5000/payment/success/${tran_id}`,
        fail_url: `http://localhost:5000/payment/fail/${tran_id}`,
        cancel_url: `http://localhost:5000/payment/cancel/${tran_id}`,
        ipn_url: "http://localhost:5000/ipn",
        shipping_method: "Courier",
        product_name: property.title,
        product_category: "Electronic",
        product_profile: "general",
        cus_name: pay.name,
        cus_email: pay.email,
        cus_add1: pay.address,
        cus_add2: "Dhaka",
        cus_city: "Dhaka",
        cus_state: "Dhaka",
        cus_postcode: "1000",
        cus_country: "Bangladesh",
        cus_phone: "01711111111",
        cus_fax: "01711111111",
        ship_name: "Customer Name",
        ship_add1: "Dhaka",
        ship_add2: "Dhaka",
        ship_city: "Dhaka",
        ship_state: "Dhaka",
        ship_postcode: 1000,
        ship_country: "Bangladesh",
      };

      console.log("Data:", data);

      // Uncomment the following code when you are ready to integrate with SSLCommerzPayment
      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
      sslcz.init(data).then((apiResponse) => {
        // Redirect the user to the payment gateway
        let GatewayPageURL = apiResponse.GatewayPageURL;
        res.send({ url: GatewayPageURL });

        // Save user details to the database
        const userDetails = {
          name: pay.name,
          email: pay.email,
          address: pay.address,
        };
        const finalOrder = {
          property,
          paidStatus: false,
          transactionId: tran_id,
          userDetails: userDetails,
        };
        const result = paymentCollection.insertOne(finalOrder);
        console.log("Redirecting to: ", GatewayPageURL);
      });

      app.post("/payment/success/:tranId", async (req, res) => {
        console.log("Payment success:", req.params.tranId);
        const result = await paymentCollection.updateOne(
          { transactionId: req.params.tranId },
          {
            $set: {
              paidStatus: true,
              successDate: new Date(),
            },
          }
        );
        if (result.modifiedCount > 0) {
          res.redirect(
            `http://localhost:5173/payment/success/${req.params.tranId}`
          );
        } else {
          res.send("Payment failed");
        }
      });
      app.post("/payment/fail/:tranId", async (req, res) => {
        const result = await paymentCollection.deleteOne({
          transactionId: req.params.tranId,
        });

        if (result.deletedCount) {
          res.redirect(
            `http://localhost:5173/payment/fail/${req.params.tranId}`
          );
        } else {
          res.send("Payment failed");
        }
      });
    });

    //user related api
    app.get("/api/v1/users", async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.get("/api/v1/users/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        res.status(400).send({ error: "Invalid ObjectId format" });
        return;
      }

      const query = { _id: new ObjectId(id) };
      const user = await userCollection.findOne(query);

      if (!user) {
        res.status(404).send({ error: "User not found" });
      } else {
        res.send(user);
      }
    });

    app.post("/api/v1/users", async (req, res) => {
      const query = { email: req.body.email };
      console.log(114, req.body.email);
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        console.log(117, existingUser);
        res.send({ message: "user already exists", insertedId: null });
      } else {
        const newUser = req.body;
        const result = await userCollection.insertOne(newUser);
        res.send(result);
      }
    });

    app.put("/api/v1/users", async (req, res) => {
      const query = { email: req.body.email };
      const existingUser = await userCollection.findOne(query);
      if (!existingUser) {
        res.send({ message: "user does not exists", insertedId: null });
      } else {
        const result = await userCollection.updateOne(query, {
          $set: req.body,
        });
        res.send(result);
      }
    });

    app.delete("/api/v1/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      try {
        const result = await userCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.get("/api/v1/users", async (req, res) => {
      const page = req.query.page || 1;
      const limit = 8;
      const skip = (page - 1) * limit;

      try {
        const users = await userCollection
          .find()
          .skip(skip)
          .limit(limit)
          .toArray();
        res.send(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    //property related api
    app.get("/api/v1/properties", async (req, res) => {
      const result = await propertyCollection
        .find({ verified: true })
        .toArray();
      res.send(result);
    });
    app.get("/api/v1/admin/properties", async (req, res) => {
      const result = await propertyCollection.find().toArray();
      res.send(result);
    });

    app.get("/api/v1/properties/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const property = await propertyCollection.findOne(query);
      res.send(property);
    });

    app.post("/api/v1/properties", async (req, res) => {
      const property = {
        title: req.body.title,
        location: req.body.location,
        image: req.body.image,
        nid: req.body.imageNID,
        agentName: req.body.agentName,
        agentEmail: req.body.agentEmail,
        agentNumber: req.body.agentNumber,
        description: req.body.description,
        status: req.body.status,
        type: req.body.type,
        price: req.body.price,
        verified: false,
      };
      const result = await propertyCollection.insertOne(property);
      res.send(result);
    });

    app.delete("/api/v1/properties/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      try {
        const result = await propertyCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.error("Error deleting property:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.put("/api/v1/properties/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedProperty = req.body;
      const newValues = { $set: updatedProperty };
      const result = await propertyCollection.updateOne(query, newValues);
      res.send(result);
    });

    //review related api
    app.get("/api/v1/review", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });
    app.post("/api/v1/review", async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });

    app.delete("/api/v1/review/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await reviewCollection.deleteOne(query);
      res.send(result);
    });
    app.get("/api/v1/wishlist", async (req, res) => {
      const wishlist = await wishlistCollection.find().toArray();
      res.send(wishlist);
    });

    app.post("/api/v1/wishlist", async (req, res) => {
      const wishlistItem = {
        propertyId: req.body.id,
        email: req.body.email,
        image: req.body.image,
        title: req.body.title,
        location: req.body.location,
        price: req.body.price,
        agentName: req.body.agentName,
        agentEmail: req.body.agentEmail,
        status: req.body.status,
        type: req.body.type,
        description: req.body.description,
        isInWishlist: true,
      };
      const result = await wishlistCollection.insertOne(wishlistItem);
      res.send(result);
    });

    app.delete("/api/v1/wishlist/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await wishlistCollection.deleteOne(query);
      res.send(result);
    });

    // admin related api
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.user.email) {
        return res.status(403).send({ message: "Unauthorized request" });
      }

      try {
        const query = { email };
        const user = await userCollection.findOne(query);

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        const isAdmin = user.role === "admin";

        res.send({ admin: isAdmin });
      } catch (error) {
        console.error(error);
        return res.status(500).send({ message: "Internal server error" });
      }
    });

    // app.patch(
    //   "/users/admin/:id",
    //   verifyToken,
    //   verifyAdmin,
    //   async (req, res) => {
    //     const id = req.params.id;
    //     const filter = { _id: new ObjectId(id) };
    //     const updatedDoc = { $set: { role: "admin", role: "agent" } };
    //     const result = await userCollection.updateOne(filter, updatedDoc);
    //     res.send(result);
    //   }
    // );

    app.get("/users/admin/:email", verifyAdmin, async (req, res) => {
      console.log(304, req.params, req?.decoded?.email);
      const email = req?.params?.email;
      if (email !== req?.user?.email) {
        return res.status(403).send({ message: "Unauthorized request" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // agent related api
    app.get("/users/agent/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.user.email) {
        return res.status(403).send({ message: "Unauthorized request" });
      }

      try {
        const query = { email };
        const user = await userCollection.findOne(query);

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        const isAgent = user.role === "agent";

        res.send({ agent: isAgent });
      } catch (error) {
        console.error(error);
        return res.status(500).send({ message: "Internal server error" });
      }
    });

    // app.patch(
    //   "/users/admin/:id",
    //   verifyToken,
    //   verifyAdmin,
    //   async (req, res) => {
    //     const id = req.params.id;
    //     const filter = { _id: new ObjectId(id) };
    //     const updatedDoc = { $set: { role: "admin", role: "agent" } };
    //     const result = await userCollection.updateOne(filter, updatedDoc);
    //     res.send(result);
    //   }
    // );

    app.patch(
      "/api/v1/users/make-admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const userId = req.params.id;
        const filter = { _id: new ObjectId(userId) };
        const updatedDoc = { $set: { role: "admin" } };

        try {
          const result = await userCollection.updateOne(filter, updatedDoc);
          res.send(result);
        } catch (error) {
          console.error("Error making user admin:", error);
          res.status(500).send("Internal Server Error");
        }
      }
    );

    app.patch(
      "/api/v1/users/make-agent/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const userId = req.params.id;
        console.log(356, userId);
        const filter = { _id: new ObjectId(userId) };
        const updatedDoc = { $set: { role: "agent" } };

        try {
          const result = await userCollection.updateOne(filter, updatedDoc);
          res.send(result);
        } catch (error) {
          console.error("Error making user agent:", error);
          res.status(500).send("Internal Server Error");
        }
      }
    );

    app.patch(
      "/api/v1/users/mark-fraud/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const userId = req.params.id;
        const filter = { _id: new ObjectId(userId), role: "agent" };
        const user = await userCollection.findOne({
          _id: new ObjectId(userId),
        });
        if (!user) {
          return res.status(404).send({ error: "User not found" });
        }

        const updatedDoc = { $set: { role: "fraud" } };

        try {
          // Add logic to remove the agent's properties and advertisements from the system

          const result = await userCollection.updateOne(filter, updatedDoc);
          res.send(result);
        } catch (error) {
          console.error("Error marking user as fraud:", error);
          res.status(500).send("Internal Server Error");
        }
      }
    );

    app.get("/users/admin/:email", verifyAdmin, async (req, res) => {
      console.log(215, req.params, req?.decoded?.email);
      const email = req?.params?.email;
      if (email !== req?.user?.email) {
        return res.status(403).send({ message: "Unauthorized request" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // Add these routes to your existing backend code

    // Verify property
    app.patch(
      "/api/v1/properties/verify/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const propertyId = req.params.id;

        try {
          const filter = { _id: new ObjectId(propertyId) };
          const updatedDoc = { $set: { verified: true } };

          const result = await propertyCollection.updateOne(filter, updatedDoc);
          res.send(result);
        } catch (error) {
          console.error("Error verifying property:", error);
          res.status(500).send("Internal Server Error");
        }
      }
    );

    // Reject property
    app.patch(
      "/api/v1/properties/reject/:id",
      verifyToken,
      async (req, res) => {
        const propertyId = req.params.id;

        try {
          const filter = { _id: new ObjectId(propertyId) };
          const updatedDoc = { $set: { verified: false } };

          const result = await propertyCollection.updateOne(filter, updatedDoc);
          res.send(result);
        } catch (error) {
          console.error("Error rejecting property:", error);
          res.status(500).send("Internal Server Error");
        }
      }
    );

    app.delete("/api/v1/properties/reject/:id", async (req, res) =>{
      const propertyId = req.params.id;
      const query = { _id: new ObjectId(propertyId) };
      try {
        const result = await propertyCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.error("Error deleting property:", error);
        res.status(500).send("Internal Server Error");
      }
    })

    // Make an offer on a property
    app.get("/api/v1/offer", async (req, res) => {
      const result = await offerCollection.find().toArray();
      res.send(result);
    });

    // app.post("/api/v1/make-offer", verifyToken, async (req, res) => {
    //   try {
    //     const { propertyId, offeredAmount } = req.body;
    //     console.log('Received propertyId:', propertyId);

    //     const property = await propertyCollection.findOne({
    //       _id: new ObjectId(propertyId),
    //     });

    //     console.log('Found property:', property);

    //     if (!property) {
    //       console.error(`Property not found for ID: ${propertyId}`);
    //       return res.status(404).send({ error: "Property not found" });
    //     }

    //     const { price } = property;

    //     if (offeredAmount < price.min || offeredAmount > price.max) {
    //       return res.status(400).send({ error: "Invalid offer amount" });
    //     }

    //     const offer = {
    //       propertyId: new ObjectId(propertyId),
    //       buyerEmail: req.user.email,
    //       offeredAmount,
    //       status: "pending",
    //       buyingDate: new Date(),
    //     };

    //     const result = await offerCollection.insertOne(offer);

    //     res.send(result);
    //   } catch (error) {
    //     console.error("Error making an offer:", error);
    //     res.status(500).send("Internal Server Error");
    //   }
    // });
    app.post("/api/v1/make-offer", verifyToken, async (req, res) => {
      const property = {
        propertyId: req.body.propertyId,
        buyerName: req.body.buyerName,
        propertyName: req.body.propertyName,
        propertyLocation: req.body.propertyLocation,
        agentEmail: req.body.agentEmail,
        offeredAmount: parseFloat(req.body.offeredAmount),
        buyerEmail: req.user.email,
        status: "pending",
        buyingDate: new Date(),
      };
      const result = await offerCollection.insertOne(property);
      res.send(result);
    });

    // Backend API for accepting an offer
    app.put("/api/v1/offer/:id/accept", verifyToken, async (req, res) => {
      const offerId = req.params.id;

      try {
        const filter = { _id: new ObjectId(offerId) };
        const updatedDoc = { $set: { status: "accepted" } };

        const result = await offerCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } catch (error) {
        console.error("Error accepting offer:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    // Backend API for rejecting an offer
    app.put("/api/v1/offer/:id/reject", verifyToken, async (req, res) => {
      const offerId = req.params.id;

      try {
        const filter = { _id: new ObjectId(offerId) };
        const updatedDoc = { $set: { status: "rejected" } };

        const result = await offerCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } catch (error) {
        console.error("Error rejecting offer:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Real Estate Server is running.....");
});

app.listen(port, () => {
  console.log(`Real Estate Server is running on port ${port}`);
});
