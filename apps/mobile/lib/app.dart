import 'package:flutter/material.dart';

import 'data/app_scope.dart';
import 'features/home/home_page.dart';
import 'theme.dart';

class ClickerApp extends StatelessWidget {
  const ClickerApp({super.key, required this.services});

  final AppServices services;

  @override
  Widget build(BuildContext context) {
    return AppScope(
      services: services,
      child: MaterialApp(
        title: 'Clicker',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        // Mobile-first: on wide screens show a centred phone-width column.
        builder: (context, child) => ColoredBox(
          color: AppColors.frame,
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: ClipRect(child: child),
            ),
          ),
        ),
        home: const HomePage(),
      ),
    );
  }
}
