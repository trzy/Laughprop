import {createContext, useCallback, useEffect, useState} from 'react';
import useWebSocket from "react-use-websocket";

export const WebSocketContext = createContext({});

export default function WebSocketContextProvider({ children }) {
    const [socketUrl, setSocketUrl] = useState('ws://localhost:8080');
    const { sendMessage, lastMessage, readyState } = useWebSocket(socketUrl);

    return (
        <>
            <WebSocketContext.Provider value={{ message: lastMessage && lastMessage.data, sendMessage: sendMessage}}>
                <p>{lastMessage && lastMessage.data}</p>
                { children }
            </WebSocketContext.Provider>
        </>
    )
}