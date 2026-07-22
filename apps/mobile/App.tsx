import React, { useState } from "react";
import { SafeAreaView, StatusBar } from "react-native";
import { JoinRoomScreen } from "./src/screens/JoinRoomScreen";
import { BuzzerScreen } from "./src/screens/BuzzerScreen";

/**
 * Point d'entrée de l'appli mobile.
 *
 * Rappel du modèle : il n'y a pas d'écran "hôte" à part entière ici. Une fois
 * dans une room, un joueur avec `is_host = true` voit simplement des
 * contrôles supplémentaires (lancer le morceau, manche suivante) au-dessus
 * du même écran de buzz que tout le monde. Voir src/screens/BuzzerScreen.tsx.
 */
export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#1A1A1A" }}>
      <StatusBar barStyle="light-content" />
      {roomId ? (
        <BuzzerScreen roomId={roomId} />
      ) : (
        <JoinRoomScreen onJoined={setRoomId} />
      )}
    </SafeAreaView>
  );
}
