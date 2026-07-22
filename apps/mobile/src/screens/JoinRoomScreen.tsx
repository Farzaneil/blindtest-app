import React, { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";

type Props = { onJoined: (roomId: string) => void };

/**
 * Écran de saisie du code de partie (ex: "BZR482") affiché sur l'écran hôte.
 * TODO: appeler Supabase pour résoudre le code -> room_id, puis créer la ligne
 * `players` correspondante (voir packages/api-clients pour le futur client
 * Supabase partagé).
 */
export function JoinRoomScreen({ onJoined }: Props) {
  const [code, setCode] = useState("");

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
      <Text style={{ color: "white", fontSize: 28, fontWeight: "800", marginBottom: 24 }}>
        Rejoindre une partie
      </Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="Code de la partie"
        placeholderTextColor="#888"
        autoCapitalize="characters"
        style={{
          borderWidth: 2,
          borderColor: "#6C2BD9",
          borderRadius: 12,
          color: "white",
          fontSize: 20,
          padding: 14,
          width: "100%",
          textAlign: "center",
          marginBottom: 20,
        }}
      />
      <Pressable
        onPress={() => code.trim() && onJoined(code.trim())}
        style={{ backgroundColor: "#6C2BD9", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 999 }}
      >
        <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Rejoindre</Text>
      </Pressable>
    </View>
  );
}
