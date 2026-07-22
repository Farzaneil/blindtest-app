import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";

type Props = { roomId: string };

/**
 * Écran principal joueur — et hôte si `player.is_host` est vrai (voir
 * HostControls plus bas). Le gros bouton de buzz domine l'écran, pensé pour
 * une prise en main à une main (cf. blueprint, section 6).
 *
 * TODO: remplacer isHost par la valeur réelle chargée depuis Supabase pour
 * ce joueur, et brancher onBuzz() sur un insert dans la table `buzzes`
 * (l'horodatage qui fait foi est `server_received_at`, généré par la base,
 * jamais l'horloge du téléphone).
 */
export function BuzzerScreen({ roomId }: Props) {
  const [isHost] = useState(false); // TODO: charger depuis Supabase
  const [buzzed, setBuzzed] = useState(false);

  const onBuzz = () => {
    if (buzzed) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setBuzzed(true);
    // TODO: insert dans `buzzes` via Supabase, room courante = roomId
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      {isHost && <HostControls roomId={roomId} />}

      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Pressable
          onPress={onBuzz}
          disabled={buzzed}
          style={{
            width: 220,
            height: 220,
            borderRadius: 110,
            backgroundColor: buzzed ? "#3A2A5C" : "#6C2BD9",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontSize: 32, fontWeight: "900" }}>
            {buzzed ? "BUZZÉ !" : "BUZZ"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Panneau de contrôle affiché en plus, uniquement pour le joueur qui a
 * is_host = true. C'est ce qui permet à un seul téléphone de projeter le son
 * (via Spotify Connect / une enceinte) ET de jouer normalement.
 */
function HostControls({ roomId }: { roomId: string }) {
  return (
    <View style={{ backgroundColor: "#2A1B4D", borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <Text style={{ color: "#C9B6F5", fontSize: 12, fontWeight: "700", marginBottom: 8 }}>
        CONTRÔLES HÔTE — Partie {roomId}
      </Text>
      <Text style={{ color: "white", fontSize: 14 }}>
        Lancer le morceau · Manche suivante · Voir le classement
      </Text>
      {/* TODO: brancher sur l'App Remote SDK Spotify + mise à jour de rounds.status */}
    </View>
  );
}
