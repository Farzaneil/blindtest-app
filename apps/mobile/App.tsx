import React, { useState } from "react";
import { SafeAreaView, StatusBar } from "react-native";
import { JoinRoomScreen } from "./src/screens/JoinRoomScreen";
import { BuzzerScreen } from "./src/screens/BuzzerScreen";

type Session = { roomId: string; playerId: string };

/**
 * Point d'entrée de l'appli mobile.
 *
 * Rappel du modèle : il n'y a pas d'écran "hôte" à part entière ici. Une fois
 * dans une room, un joueur avec `is_host = true` pourra voir des contrôles
 * supplémentaires au-dessus du même écran de buzz que tout le monde (pas
 * encore câblé dans cette itération : le lancement de manche se fait depuis
 * apps/web-host pour l'instant, voir BuzzerScreen.tsx).
 */
export default function App() {
  const [session, setSession] = useState<Session | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#1A1A1A" }}>
      <StatusBar barStyle="light-content" />
      {session ? (
        <BuzzerScreen roomId={session.roomId} playerId={session.playerId} />
      ) : (
        <JoinRoomScreen onJoined={setSession} />
      )}
    </SafeAreaView>
  );
}
