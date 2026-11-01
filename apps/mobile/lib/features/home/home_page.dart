import 'package:flutter/material.dart';

import '../../core/model/model.dart';
import '../../data/app_scope.dart';
import '../../widgets/clicker_art_view.dart';
import '../create/create_page.dart';
import '../market/market_page.dart';
import '../play/play_page.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this)
    ..addListener(() => setState(() {}));

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: scheme.primary,
                borderRadius: BorderRadius.circular(11),
              ),
              child: const Icon(Icons.touch_app_rounded,
                  color: Colors.white, size: 22),
            ),
            const SizedBox(width: 10),
            const Text('Clicker',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 26)),
          ],
        ),
        bottom: TabBar(
          controller: _tabs,
          labelStyle:
              const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          tabs: const [Tab(text: '내 클릭커'), Tab(text: '마켓')],
        ),
      ),
      floatingActionButton: _tabs.index == 0
          ? FloatingActionButton.extended(
              onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const CreatePage())),
              icon: const Icon(Icons.add_a_photo_rounded),
              label: const Text('만들기',
                  style: TextStyle(fontWeight: FontWeight.w800)),
            )
          : null,
      body: TabBarView(
        controller: _tabs,
        children: const [_MyClickers(), MarketPage()],
      ),
    );
  }
}

class _MyClickers extends StatelessWidget {
  const _MyClickers();

  @override
  Widget build(BuildContext context) {
    final services = AppScope.of(context);
    return ListenableBuilder(
      listenable:
          Listenable.merge([services.repository.changes, services.records]),
      builder: (context, _) {
        final items = services.repository.list();
        return CustomScrollView(
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
              sliver: SliverToBoxAdapter(
                child: Text(
                  '눌러 보고, 콤보를 쌓아 보세요.',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 112),
              sliver: SliverGrid.builder(
                itemCount: items.length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 14,
                  crossAxisSpacing: 14,
                  childAspectRatio: 0.78,
                ),
                itemBuilder: (context, i) => _ClickerCard(spec: items[i]),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ClickerCard extends StatelessWidget {
  const _ClickerCard({required this.spec});
  final ClickerSpec spec;

  @override
  Widget build(BuildContext context) {
    final record = AppScope.of(context).records.get(spec.id);
    final theme = Theme.of(context);
    final hasRecord = record.bestScore > 0 || record.bestCombo > 0;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: ValueKey('clicker-card-${spec.id}'),
        onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => PlayPage(spec: spec))),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(18),
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFFFFF1E6), Color(0xFFFFDCC8)],
                    ),
                  ),
                  padding: const EdgeInsets.all(10),
                  child: Center(child: ClickerArtView(spec.idle)),
                ),
              ),
              const SizedBox(height: 10),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Text(spec.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium),
              ),
              const SizedBox(height: 2),
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 0, 4, 4),
                child: Text(
                  hasRecord
                      ? '최고 ${record.bestScore}회 · 콤보 ${record.bestCombo}'
                      : '아직 기록 없음',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
