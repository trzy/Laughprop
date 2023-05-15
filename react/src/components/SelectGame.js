import {Button, Form} from "react-bootstrap";

function SelectGame({data}) {
    return (
        <>
            {
                data.games.map((game) => (
                    <Button>{game.name}</Button>
                ))
            }
        </>
    )
}
export default SelectGame;
