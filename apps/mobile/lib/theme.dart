import 'package:flutter/material.dart';

import 'core/game/combo.dart';

/// "Tomato & mint" playful palette.
abstract final class AppColors {
  static const tomato = Color(0xFFFF5A36);
  static const mint = Color(0xFF14B8A6);
  static const cream = Color(0xFFFFF7EE);
  static const cocoa = Color(0xFF2A1A16);
  static const frame = Color(0xFF1F1411);

  static List<Color> tierGradient(ComboTier t) => switch (t) {
        ComboTier.calm => const [Color(0xFFFFF7EE), Color(0xFFFFE4D4)],
        ComboTier.charged => const [Color(0xFFFFEFC2), Color(0xFFFFC27A)],
        ComboTier.wild => const [Color(0xFFFFC1D2), Color(0xFFFF7A59)],
        ComboTier.frenzy => const [Color(0xFFD7B8FF), Color(0xFFFF5FA2)],
      };

  static Color tierAccent(ComboTier t) => switch (t) {
        ComboTier.calm => tomato,
        ComboTier.charged => const Color(0xFFFF9F1C),
        ComboTier.wild => const Color(0xFFFF2E63),
        ComboTier.frenzy => const Color(0xFF8A4DFF),
      };
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.tomato,
    dynamicSchemeVariant: DynamicSchemeVariant.vibrant,
  ).copyWith(
    primary: AppColors.tomato,
    onPrimary: Colors.white,
    tertiary: AppColors.mint,
    surface: AppColors.cream,
    onSurface: AppColors.cocoa,
  );
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    fontFamily: 'Pretendard',
  );
  final text = base.textTheme.apply(
    bodyColor: AppColors.cocoa,
    displayColor: AppColors.cocoa,
  );
  return base.copyWith(
    scaffoldBackgroundColor: AppColors.cream,
    textTheme: text.copyWith(
      headlineLarge: text.headlineLarge?.copyWith(fontWeight: FontWeight.w900),
      headlineMedium:
          text.headlineMedium?.copyWith(fontWeight: FontWeight.w900),
      titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w800),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 52),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 52),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    chipTheme: base.chipTheme.copyWith(
      shape: const StadiumBorder(),
      showCheckmark: false,
      labelStyle: const TextStyle(fontWeight: FontWeight.w700),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      margin: EdgeInsets.zero,
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: AppColors.cream,
      showDragHandle: true,
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}
