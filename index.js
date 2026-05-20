const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 8000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const uri = process.env.MONGODB_URI;
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);
console.log(JWKS);

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const logger = (req, res, next) => {
  next();
};

const verifyToken = async (req, res, next) => {
  const { authorization } = req.headers;
  const token = authorization?.split(" ")[1];
  // console.log(token)

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const JWKS = createRemoteJWKSet(
      new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
    );
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    // console.log(req.user)
    next();
  } catch (error) {
    console.error("Token validation failed:", error);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });

    const db = client.db("mediQueuedb");
    const tutorsCollection = db.collection("tutors");
    const bookingCollection = db.collection("bookings");

    //All Data API
    app.get("/tutors", async (req, res) => {
      const { search } = req.query;
      let cursor;
      if (search) {
        cursor = tutorsCollection.find({
          $or: [
            {
              name: {
                $regex: search,
                $options: "i",
              },
            },
            {
              subject: {
                $regex: search,
                $options: "i",
              },
            },
          ],
        });
      } else {
        cursor = tutorsCollection.find();
      }

      const result = await cursor.toArray();
      console.log(result);
      res.send(result);
    });

    //Available Cards Section
    app.get("/available", async (req, res) => {
      const cursor = tutorsCollection.find().limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    //Single Data API
    app.get("/tutors/:tutorId", logger, verifyToken, async (req, res) => {
      console.log(req.user, "req");

      const { tutorId } = req.params;
      const query = { _id: new ObjectId(tutorId) };
      const result = await tutorsCollection.findOne(query);
      res.send(result);
    });

    //Booked Session API
    app.get("/booked-sessions/:userId", verifyToken, async (req, res) => {
      const { userId } = req.params;
      const result = await bookingCollection.find({ userId: userId }).toArray();
      res.send(result);
    });

    //Booking API
    app.patch("/bookings/:tutorId", verifyToken, async (req, res) => {
      const { tutorId } = req.params;
      const bookingData = req.body;
      const tutor = await tutorsCollection.findOne({
        _id: new ObjectId(tutorId),
      });

      if (!tutor) {
        res.status(404).json({ message: "Tutor not found!" });
      }
      await tutorsCollection.updateOne(
        { _id: new ObjectId(tutorId) },
        {
          $inc: { totalSlot: -1 },
          $set: {
            lastBookingAt: new Date(),
          },
        },
      );
      const result = await bookingCollection.insertOne({
        ...bookingData,
        enrolledAt: new Date(),
      });
      res.send(result);
    });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
