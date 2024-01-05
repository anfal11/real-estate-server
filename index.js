const express = require("express");
const app = express();
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

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db("realEstateDB").collection("users");
    const propertyCollection = client.db("realEstateDB").collection("properties");
    const reviewCollection = client.db("realEstateDB").collection("review");
    const propertyReviewCollection = client.db("realEstateDB").collection("propertyReview");
    const wishlistCollection = client.db("realEstateDB").collection("wishlist");

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
        const users = await userCollection.find().skip(skip).limit(limit).toArray();
        res.send(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send("Internal Server Error");
      }
    });
    

    //property related api
    app.get("/api/v1/properties", async (req, res) => {
      const result = await propertyCollection.find({ verified: true }).toArray();
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

    app.post("/api/v1/properties", async (req, res)=>{
      const property = {
        title: req.body.title,
        location: req.body.location,
        image: req.body.image,
        nid: req.body.imageNID,
        agentName: req.body.agentName,
        agentEmail: req.body.agentEmail,
        description: req.body.description,
        status: req.body.status,
        type: req.body.type,
        price: req.body.price,
        verified: false,
      }
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

    app.get("/api/v1/wishlist", async (req, res) => {
        const wishlist = await wishlistCollection.find().toArray();
        res.send(wishlist);
    })

    app.post("/api/v1/wishlist", async (req, res) => {
      const wishlistItem = {
        propertyId: req.body.id, 
        email: req.body.email,
        image: req.body.image,
        title: req.body.title,
        location: req.body.location,
        price: req.body.price,
        status: req.body.status,
        type: req.body.type,
        description: req.body.description,
        isInWishlist: true,
      };
        const result = await wishlistCollection.insertOne(wishlistItem);
        res.send(result);
    })

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

    app.patch("/api/v1/users/make-admin/:id", verifyToken, verifyAdmin, async (req, res) => {
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
    });

    app.patch("/api/v1/users/make-agent/:id", verifyToken, verifyAdmin, async (req, res) => {
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
    });

    app.patch("/api/v1/users/mark-fraud/:id", verifyToken, verifyAdmin, async (req, res) => {
      const userId = req.params.id;
      const filter = { _id: new ObjectId(userId), role: "agent" };
      const user = await userCollection.findOne({ _id: new ObjectId(userId) });
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
    });
    
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
app.patch("/api/v1/properties/verify/:id", verifyToken, verifyAdmin, async (req, res) => {
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
});

// Reject property
app.patch("/api/v1/properties/reject/:id", verifyToken,  async (req, res) => {
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
