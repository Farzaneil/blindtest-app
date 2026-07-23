import React, { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { subscribeToCurrentRound, sendBuzz, type Round } from "../lib/rooms";

type Props = { roomId: string; playerId: string };

/**
 * Écran principal joueur — et hôte si `player.is_host` est vrai (voir
 * HostControls plus bas, pas encore branché dans cette itération : le
 * lancement de manche se fait depuis apps/web-host pour l'instant).
 */
export function BuzzerScreen({ roomId, playerId }: Props) {
  const [round, setRound] = useState<Round | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    return subscribeToCurrentRound(roomId, setRound);
  }, [roomId]);

  const alreadyBuzzed = round?.status === "buzzed" || round?.status === "revealed" || round?.status === "scored";
  const canBuzz = round?.status === "playing" && !sending;
  const iWon = alreadyBuzzed && round?.buzzed_by_player_id === playerId;

  const onBuzz = async () => {
    if (!round || !canBuzz) return;
    setSending(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await sendBuzz(round.id, playerId);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 16, justifyContent: "center", alignItems: "center" }}>
      {!round && (
        <Text style={{ color: "#888", fontSize: 18, textAlign: "center" }}>
          En attente du lancement d’une manche par l’hôte…
        </Text>
      )}

      {round && (
        <>
          <Pressable
            onPress={onBuzz}
            disabled={!canBuzz}
            style={{
              width: 220,
              height: 220,
              borderRadius: 110,
              backgroundColor: canBuzz ? "#6C2BD9" : "#3A2A5C",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 24,
            }}
          >
            <Text style={{ color: "white", fontSize: 32, fontWeight: "900" }}>
              {alreadyBuzzed ? "BUZZÉ !" : "BUZZ"}
            </Text>
          </Pressable>

          {alreadyBuzzed && (
            <Text style={{ color: iWon ? "#1DB954" : "#E5484D", fontSize: 20, fontWeight: "700" }}>
              {iWon ? "Tu as buzzé en premier !" : "Trop tard, un autre joueur a buzzé avant toi."}
            </Text>
          )}
        </>
      )}
    </View>
  );
}
