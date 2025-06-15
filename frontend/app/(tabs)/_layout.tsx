import { View, Text, Pressable } from 'react-native';
import React, { ReactElement } from 'react';
import { Tabs } from 'expo-router';
import Octicons from '@expo/vector-icons/Octicons';
import Feather from '@expo/vector-icons/Feather';
import { CONSTANTS } from '@/utils/constant';
import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';

const TabIcon = ({
  focused,
  label,
  icon,
}: {
  focused: boolean;
  label: String;
  icon: ReactElement;
}) => {
  if (focused) {
    return (
      <View className='flex flex-row items-center justify-center gap-2 bg-primary w-28 h-14 rounded-full'>
        {icon}
        <Text className='text-secondary text-[15px] font-bold'>{label}</Text>
      </View>
    );
  }
  return <View className='w-full h-full flex items-center justify-center'>{icon}</View>;
};

const CustomTabBarButton = ({ children, onPress }: BottomTabBarButtonProps) => {
  return (
    <Pressable
      onPress={onPress}
      className='rounded-full flex items-center justify-center'
      android_ripple={{ color: CONSTANTS.colors.ripple, borderless: true }}
    >
      {children}
    </Pressable>
  );
};

const HomeLayout = () => {
  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: false,
        tabBarButton: (props) => <CustomTabBarButton {...props} />,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopRightRadius: 20,
          borderTopLeftRadius: 20,
          height: 68,
          paddingTop: 20,
          borderWidth: 0,
          boxShadow: '0 0 10px rgba(0,0,0,0.2)',
        },
      }}
    >
      <Tabs.Screen
        name='index'
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              label='Home'
              icon={
                <Octicons
                  name='home'
                  size={22}
                  color={focused ? CONSTANTS.colors.secondary : 'black'}
                />
              }
            />
          ),
        }}
      />
      <Tabs.Screen
        name='cart'
        options={{
          title: 'Cart',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              label='Cart'
              icon={
                <Feather
                  name='shopping-cart'
                  size={22}
                  color={focused ? CONSTANTS.colors.secondary : 'black'}
                />
              }
            />
          ),
        }}
      />
      <Tabs.Screen
        name='profile'
        options={{
          title: 'Profile',
          headerShown: true,
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              label='Profile'
              icon={
                <Feather
                  name='user'
                  size={22}
                  color={focused ? CONSTANTS.colors.secondary : 'black'}
                />
              }
            />
          ),
        }}
      />
    </Tabs>
  );
};

export default HomeLayout;
