import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { joinRoomByCode } from "../lib/rooms";

type Props = {
  onJoined: (info: { roomId: string; playerId: string }) => void;
};

/**
 * Écran de saisie du code de partie (affiché sur l'écran hôte) + pseudo.
 * Rejoint réellement la room via Supabase (insertion dans `players`).
 */
export function JoinRoomScreen({ onJoined }: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = code.trim().length > 0 && name.trim().length > 0 && !loading;

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const { room, player } = await joinRoomByCode(code.trim(), name.trim());
      onJoined({ roomId: room.id, playerId: player.id });
    } catch (e: any) {
      setError(e?.message ?? "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

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
          marginBottom: 14,
        }}
      />

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Ton pseudo"
        placeholderTextColor="#888"
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

      {error && (
        <Text style={{ color: "#E5484D", marginBottom: 16, textAlign: "center" }}>{error}</Text>
      )}

      <Pressable
        onPress={onSubmit}
        disabled={!canSubmit}
        style={{
          backgroundColor: canSubmit ? "#6C2BD9" : "#3A2A5C",
          paddingVertical: 14,
          paddingHorizontal: 32,
          borderRadius: 999,
        }}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Rejoindre</Text>
        )}
      </Pressable>
    </View>
  );
}
