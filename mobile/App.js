import React from 'react';
import { StyleSheet, Text, View, StatusBar, Platform } from 'react-native';
import { usePushNotifications } from '../src/hooks/usePushNotifications';

export default function App() {
  const { expoPushToken, notification } = usePushNotifications();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>iUser Mobile</Text>
        <Text style={styles.subtitle}>Sistema de Notificações Ativo</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Seu Token de Push:</Text>
        <Text style={styles.token} selectable>
          {expoPushToken ? expoPushToken : 'Obtendo token...'}
        </Text>
      </View>

      {notification && (
        <View style={[styles.card, styles.notifCard]}>
          <Text style={styles.label}>Última Notificação:</Text>
          <Text style={styles.notifTitle}>{notification.request.content.title}</Text>
          <Text style={styles.notifBody}>{notification.request.content.body}</Text>
        </View>
      )}

      <Text style={styles.footer}>
        Apenas dispositivos físicos podem receber notificações push.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1a1a1a',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 14,
    color: '#22c55e',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    marginBottom: 20,
  },
  notifCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#22c55e',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6c757d',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  token: {
    fontSize: 12,
    color: '#343a40',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  notifTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1a1a',
  },
  notifBody: {
    fontSize: 14,
    color: '#495057',
    marginTop: 4,
  },
  footer: {
    marginTop: 20,
    fontSize: 11,
    color: '#adb5bd',
    textAlign: 'center',
  }
});
