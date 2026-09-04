import 'package:flutter_test/flutter_test.dart';
import 'package:theeb_arab/main.dart';

void main() {
  testWidgets('Theeb Arab shell renders Arabic search UI', (tester) async {
    await tester.pumpWidget(const TheebArabApp());
    expect(find.text('ذيب العرب'), findsOneWidget);
    expect(find.text('بحث'), findsOneWidget);
    expect(find.text('ابحث عن مسلسل أو فيلم…'), findsOneWidget);
  });
}
