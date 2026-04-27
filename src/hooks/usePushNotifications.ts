import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { createClient } from '../lib/supabase/client';

// Configuração básica do handler de notificações
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const usePushNotifications = () => {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>();
  const [notification, setNotification] = useState<Notifications.Notification | undefined>();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  const supabase = createClient();

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      setExpoPushToken(token);
      if (token) saveTokenToSupabase(token);
    });

    // Listener para quando uma notificação é recebida com o app aberto (Foreground)
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    // Listener para quando o usuário interage com a notificação
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Interação com notificação:', response);
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  const saveTokenToSupabase = async (token: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const platform = Platform.OS; // 'ios' | 'android'

      const { error } = await supabase
        .from('push_tokens')
        .upsert({ 
          user_id: session.user.id, 
          token: token, 
          platform: platform,
          updated_at: new Date() 
        }, { onConflict: 'user_id, token' });

      if (error) console.error('[PushToken] Erro ao salvar no Supabase:', error.message);
    } catch (err) {
      console.error('[PushToken] Falha crítica ao salvar token:', err);
    }
  };

  return { expoPushToken, notification };
};

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('Falha ao obter permissão para notificações push!');
      return;
    }
    
    // EAS Project ID
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    
    if (!projectId) {
      console.warn('Project ID do EAS não encontrado no app.json');
    }

    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } else {
    console.warn('Aviso: Notificações Push só funcionam em dispositivos físicos.');
  }

  return token;
}
