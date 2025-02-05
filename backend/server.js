const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const rooms = {};

io.on("connection", (socket) => {
    socket.on("join-room", (roomId) => {
        if (!rooms[roomId]) rooms[roomId] = [];
        rooms[roomId].push(socket.id);

        const otherUsers = rooms[roomId].filter(id => id !== socket.id);
        socket.emit("all-users", otherUsers);

        socket.join(roomId);
    });

    socket.on("offer", ({ offer, to }) => {
        io.to(to).emit("offer", { offer, from: socket.id });
    });

    socket.on("answer", ({ answer, to }) => {
        io.to(to).emit("answer", { answer, from: socket.id });
    });

    socket.on("ice-candidate", ({ candidate, to }) => {
        io.to(to).emit("ice-candidate", { candidate, from: socket.id });
    });

    socket.on("disconnect", () => {
        for (const roomId in rooms) {
            rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
        }
    });
});

server.listen(5000, () => console.log("Server running on port 5000"));
