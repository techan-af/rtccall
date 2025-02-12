import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const socket = io("https://rtccall.onrender.com");

export default function Home() {
    const [room, setRoom] = useState("");
    const [joined, setJoined] = useState(false);
    const myStream = useRef(null);
    const mediaRecorder = useRef(null);
    const recordedChunks = useRef([]);
    const peerConnections = useRef({});
    const audioContext = useRef(null);
    const destination = useRef(null);

    useEffect(() => {
        socket.on("all-users", (users) => {
            users.forEach(userId => createOffer(userId));
        });

        socket.on("offer", ({ offer, from }) => {
            createAnswer(offer, from);
        });

        socket.on("answer", ({ answer, from }) => {
            peerConnections.current[from].setRemoteDescription(new RTCSessionDescription(answer));
        });

        socket.on("ice-candidate", ({ candidate, from }) => {
            peerConnections.current[from].addIceCandidate(new RTCIceCandidate(candidate));
        });
    }, []);

    const joinRoom = async () => {
        if (!room) return;
        setJoined(true);

        // Get local audio stream
        myStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Set up the AudioContext and destination node for mixing audio
        audioContext.current = new AudioContext();
        destination.current = audioContext.current.createMediaStreamDestination();

        // Connect local audio to the destination
        const localSource = audioContext.current.createMediaStreamSource(myStream.current);
        localSource.connect(destination.current);

        socket.emit("join-room", room);
        startRecording();
    };

    const createOffer = async (userId) => {
        const peer = new RTCPeerConnection();
        peerConnections.current[userId] = peer;

        // Add local tracks to the peer connection
        myStream.current.getTracks().forEach(track => peer.addTrack(track, myStream.current));

        peer.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("ice-candidate", { candidate: event.candidate, to: userId });
            }
        };

        // When a remote track is received, add it to the audio mix
        peer.ontrack = (event) => addPeerStream(event.streams[0]);

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit("offer", { offer, to: userId });
    };

    const createAnswer = async (offer, from) => {
        const peer = new RTCPeerConnection();
        peerConnections.current[from] = peer;

        // Add local tracks to the connection
        myStream.current.getTracks().forEach(track => peer.addTrack(track, myStream.current));

        peer.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("ice-candidate", { candidate: event.candidate, to: from });
            }
        };

        // When a remote track is received, add it to the audio mix
        peer.ontrack = (event) => addPeerStream(event.streams[0]);

        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit("answer", { answer, to: from });
    };

    // Connect remote stream to both local playback and audio mixing
    const addPeerStream = (stream) => {
        // Play the remote audio locally
        const audio = document.createElement("audio");
        audio.srcObject = stream;
        audio.autoplay = true;
        document.body.appendChild(audio);

        // Connect remote audio to the destination node for recording
        if (audioContext.current && destination.current) {
            try {
                const remoteSource = audioContext.current.createMediaStreamSource(stream);
                remoteSource.connect(destination.current);
            } catch (error) {
                console.error("Error connecting remote stream:", error);
            }
        }
    };

    // Start recording using the combined audio stream from the destination node
    const startRecording = () => {
        mediaRecorder.current = new MediaRecorder(destination.current.stream);
        mediaRecorder.current.ondataavailable = (event) => recordedChunks.current.push(event.data);
        mediaRecorder.current.onstop = saveRecording;
        mediaRecorder.current.start();
    };

    const saveRecording = () => {
        const blob = new Blob(recordedChunks.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `recording-${room}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        recordedChunks.current = [];
    };

    const leaveRoom = () => {
        mediaRecorder.current.stop();
        setJoined(false);
        Object.values(peerConnections.current).forEach(peer => peer.close());
        peerConnections.current = {};
    };

    return (
        <div style={{ textAlign: "center", padding: "20px" }}>
            {!joined ? (
                <>
                    <input type="text" placeholder="Enter Room ID" onChange={(e) => setRoom(e.target.value)} />
                    <button onClick={joinRoom}>Join</button>
                </>
            ) : (
                <>
                    <h2>Connected to Room: {room}</h2>
                    <button onClick={leaveRoom}>Leave & Save Recording</button>
                </>
            )}
        </div>
    );
}
