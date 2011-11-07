print "Line 1\n"
var1 = {'key'=>'value1','items'=>['item1','item2']}
var2 = 'val2'
print "Line 2\n"
def func1(in1)
  print "Function 1\n"
  puts "#{in1}\n"
  in1['items'] << 'item3'
  puts "#{in1}\n"
end
func1(var1)
print "Line 3\n"