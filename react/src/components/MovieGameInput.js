import {Button, ButtonGroup, Col, Container, FloatingLabel, Form, InputGroup, Row} from "react-bootstrap";
import {useCallback, useContext, useEffect, useState} from "react";
import {WebSocketContext} from "../contexts/WebSocketContextProvider";

function MovieGameInput({data}) {

    const [selectedMovie, setSelectedMovie] = useState({})
    const { message, sendMessage } = useContext(WebSocketContext)

    useEffect(() => {
        console.log("message " + message)
    }, [message])

    const next = () => {
        sendMessage(selectedMovie.name)
    }

    return (
        <div>
            <ButtonGroup>
                {
                    data.movies.map((movie) => (
                        <Button onClick={() => setSelectedMovie(movie)}>{movie.name}</Button>

                    ))
                }
            </ButtonGroup>
            {
                (selectedMovie.cast) && (
                    <MovieGameCastInput cast={selectedMovie.cast}/>
                )
            }
            {
                (selectedMovie.name) &&
                    <Button onClick={next}>Next</Button>
            }
        </div>
    )
}

function MovieGameCastInput({cast}) {
    return (
        cast.map((c) => (
            <FloatingLabel label={c}>
                <Form.Control/>
            </FloatingLabel>
        ))
    )
}

export default MovieGameInput;