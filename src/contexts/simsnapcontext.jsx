import React, { createContext } from 'react';
import * as sock from 'socket.io';

//-----Socket Initialization-----//
const socket = sock.io();

socket.on("Reset", () => {
    //disconnect
});

socket.on("Vsnap", (data) => {

});

socket.on("Hsnap", (data) => {

})

socket.on("Top", function (partnerID) {
partners.top = partnerID;
});

socket.on("Bottom", function (partnerID) {
partners.bottom = partnerID;
});

socket.on("Left", function (partnerID) {
partners.left = partnerID;
});

socket.on("Right", function (partnerID) {
partners.right = partnerID;
});

socket.on("Update", (data) => {

});

//-----Context Initialization-----//
const SnapContext = createContext();
const UpdateSnapContext = createContext();

export const SnapContextProvider = ({children}) => {
    const [snapContext, setSnapContext] = useState(0);

    //probably do stuff here as simsnap changes stuff

    return(
        <SnapContext.Provider value={{snapContext}}>
            <UpdateSnapContext.Provider value={{setSnapContext}}>
                {children}
            </UpdateSnapContext.Provider>
        </SnapContext.Provider>
    )
}

export const useSnapContext = () => {
    const context = useContext(SnapContext);
    if(!context){
        throw new Error("SnapContext Error");
    }
    return context
}

export const useUpdateSnapContext = () => {
    const context = useContext(UpdateSnapContext);
    if(!context){
        throw new Error("Update SnapContext Error");
    }
    return context
}