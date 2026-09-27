import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  Text,
  View,
} from "react-native";

type Event = {
  id: string;
  title: string;
  venue_name: string;
  start_time: string;
};

const API_URL = "http://192.168.10.13:8000";
// IMPORTANT: replace this with your laptop's IPv4 address

export default function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/events`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load events");
        }

        return response.json();
      })
      .then((data) => {
        setEvents(data);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ padding: 20 }}>
        <Text>Error: {error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 20 }}>
      <Text
        style={{
          fontSize: 28,
          fontWeight: "bold",
          marginBottom: 20,
        }}
      >
        BiletFlow
      </Text>

      <FlatList
        data={events}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View
            style={{
              padding: 16,
              borderWidth: 1,
              borderRadius: 10,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "bold",
              }}
            >
              {item.title}
            </Text>

            <Text>{item.venue_name}</Text>
            <Text>{item.start_time}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}