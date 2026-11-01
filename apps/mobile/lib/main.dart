import 'package:flutter/material.dart';

import 'app.dart';
import 'data/app_scope.dart';

void main() {
  runApp(ClickerApp(services: AppServices.platformDefault()));
}
