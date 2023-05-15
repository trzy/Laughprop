import logo from './logo.svg';
import MovieGameInput from "./components/MovieGameInput";
import 'bootstrap/dist/css/bootstrap.min.css';
import {Container} from "react-bootstrap";
import StartGame from "./components/StartGame";
import SelectGame from "./components/SelectGame";
import WebSocketContextProvider, {GameContext} from "./contexts/WebSocketContextProvider";


const fakeData = {
    movies: [
        {
            name: "Bloodsport",
            cast: [ "Actor 1", "Actor 2", "Actor 3" ]
        },
        {
            name: "The Hangover",
            cast: [ "Actor 1", "Actor 2" ]
        },
        {
            name: "Star Wars",
            cast: [ "Actor 1", "Actor 2", "Actor 3", "Actor 4" ]
        },
    ],
    games: [
        {
            name: "It's a Mood",
        },
        {
            name: "I'd Watch That",
        },
    ]
}

function App() {
    return (
        <div className="App">
            <Container>
                <h1>Laughprop</h1>
                    <WebSocketContextProvider>
                        <StartGame></StartGame>
                        <SelectGame data={fakeData}></SelectGame>
                        <MovieGameInput data={fakeData}/>
                    </WebSocketContextProvider>
            </Container>
        </div>
    );
}

export default App;
