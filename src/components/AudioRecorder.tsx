import React, { useState, useRef, useEffect } from 'react';
import { RealtimeClient } from '@openai/realtime-api-beta';

const AudioRecorder: React.FC = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [hasResponse, setHasResponse] = useState(false);
    const clientRef = useRef<RealtimeClient | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const lastPlayedAudioRef = useRef<string | null>(null);

    useEffect(() => {
        const client = new RealtimeClient({
            apiKey: import.meta.env.VITE_OPENAI_API_KEY,
            dangerouslyAllowAPIKeyInBrowser: true,
        });

        client.updateSession({
            instructions: 'Staring now you are a translator, translate everything I say to you to Chinese, if you dont recognize the word for example if it is a name of a person or company just say the word. Respond with just the audio translation and nothing else.',
            voice: 'alloy',
            input_audio_transcription: { model: 'whisper-1' },
        });

        client.on('conversation.updated', (event: any) => {
            const { item } = event;
            console.log(item);
            if (item.role === 'assistant' && item.formatted?.audio && item.status === 'completed') {
                handleAudioResponse(item.formatted.audio, item.id);
            }
        });

        clientRef.current = client;
        audioContextRef.current = new (window.AudioContext)();

        return () => {
            client.disconnect();
            audioContextRef.current?.close();
        };
    }, []);

    const handleAudioResponse = (audioData: Int16Array, itemId: string) => {
        if (!audioData || audioData.length === 0) {
            console.error('No audio data received');
            return;
        }

        if (lastPlayedAudioRef.current === itemId) {
            console.log('This audio has already been played');
            return;
        }

        const audioContext = audioContextRef.current;
        if (!audioContext) {
            console.error('AudioContext not available');
            return;
        }

        // Convert Int16Array to Float32Array
        const floatArray = new Float32Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
            floatArray[i] = audioData[i] / 32768.0;
        }

        // Create an AudioBuffer (assuming 24000 Hz sample rate, mono)
        const audioBuffer = audioContext.createBuffer(1, floatArray.length, 24000);
        audioBuffer.getChannelData(0).set(floatArray);

        // Create a source node from the buffer
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;

        // Connect the source to the audio context's destination (the speakers)
        source.connect(audioContext.destination);

        // Play the audio
        source.start();
        setHasResponse(true);
        lastPlayedAudioRef.current = itemId;
    };

    const startRecording = async () => {
        try {
            if (!clientRef.current?.isConnected()) {
                await clientRef.current?.connect();
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = mediaRecorder;

            let audioChunks: Blob[] = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const arrayBuffer = await audioBlob.arrayBuffer();
                const audioContext = new (window.AudioContext)();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                const float32Array = audioBuffer.getChannelData(0);
                const int16Array = new Int16Array(float32Array.length);
                for (let i = 0; i < float32Array.length; i++) {
                    int16Array[i] = Math.max(-32768, Math.min(32767, Math.floor(float32Array[i] * 32768)));
                }
                clientRef.current?.appendInputAudio(int16Array);
                console.log('Sending audio data:', int16Array.length);
                clientRef.current?.createResponse();
                audioChunks = [];
            };

            mediaRecorder.start(100);
            setIsRecording(true);
        } catch (error) {
            console.error('Error starting recording:', error);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    return (
        <div>
            <button onClick={isRecording ? stopRecording : startRecording}>
                {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>
        </div>
    );
};

export default AudioRecorder;